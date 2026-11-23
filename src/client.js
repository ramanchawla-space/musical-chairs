// Client-side game model. One per browser (the host has one too, wired to the
// hub through a local link). It mirrors the host's state, keeps a synced clock,
// computes the dance positions locally and — after the music stops — simulates
// this player's own movement so steering has zero network latency.

import {
  chairLayout, chairPosAt, layoutRadius, choreography, dancePos, chairsAtTime, clampToArena,
  arenaFor, roundHazards, bouncers, BOUNCER_RADIUS, MOVE_SPEED, SIT_DISTANCE, CHAIR_RADIUS, PLAYER_RADIUS, patternPos,
} from './core.js'
import { PING_MS } from './net.js'

const INTERP_MS = 110

export class GameClient {
  constructor(link, profile) {
    this.link = link
    this.profile = profile
    this.me = null
    this.isHost = false
    this.roster = new Map()
    this.state = null
    this.round = null       // derived geometry for the current round
    this.offset = 0         // hostTime - localTime
    this.bestRtt = Infinity
    this.lastPong = Date.now()
    this.snaps = new Map()  // id -> [{t,x,y}]
    this.self = null        // local sim during scramble: {x,y,vx,vy}
    this.input = { keys: new Set(), target: null }
    this.pendingSit = -1
    this.pendingAt = 0
    this.listeners = new Map()
    this.lastPosSent = 0

    link.onMessage = (m) => this.onMessage(m)
    link.onClose = () => this.emit('lost')
    this.send({ t: 'hello', ...profile })
    this.ping()
    this.pinger = setInterval(() => {
      this.ping()
      if (Date.now() - this.lastPong > 7000) this.emit('lost')
    }, PING_MS)
  }

  on(ev, fn) {
    if (!this.listeners.has(ev)) this.listeners.set(ev, [])
    this.listeners.get(ev).push(fn)
  }

  emit(ev, ...a) {
    for (const fn of this.listeners.get(ev) || []) fn(...a)
  }

  send(m) { this.link.send(m) }

  ping() { this.send({ t: 'ping', c: Date.now() }) }

  hostNow() { return Date.now() + this.offset }

  onMessage(m) {
    switch (m.t) {
      case 'welcome':
        this.me = m.you
        this.isHost = m.host
        this.emit('welcome')
        break
      case 'pong': {
        this.lastPong = Date.now()
        const rtt = Date.now() - m.c
        // Keep the lowest-latency sample: its midpoint estimate is the tightest.
        if (rtt <= this.bestRtt * 1.2 || rtt < 40) {
          this.bestRtt = Math.min(this.bestRtt, rtt)
          this.offset = m.h - (m.c + rtt / 2)
        }
        break
      }
      case 'roster':
        this.roster = new Map(m.players.map((p) => [p.id, p]))
        this.emit('roster')
        break
      case 'state':
        this.onState(m)
        break
      case 'snap': {
        const t = Date.now()
        for (const [id, [x, y]] of Object.entries(m.p)) {
          if (id === this.me) continue
          const buf = this.snaps.get(id) || []
          buf.push({ t, x, y })
          while (buf.length > 12) buf.shift()
          this.snaps.set(id, buf)
        }
        break
      }
      case 'sitDenied':
        if (this.pendingSit === m.chair) this.pendingSit = -1
        this.emit('denied')
        break
      case 'react':
        this.emit('react', m.id, m.e)
        break
      case 'kicked':
        this.emit('kicked')
        break
    }
  }

  onState(s) {
    const prev = this.state
    this.state = s
    const r = s.round
    if (r && (!this.round || this.round.seed !== r.seed)) {
      const chairs = chairLayout(r.layout, r.m, r.seed)
      const R = layoutRadius(chairs)
      this.round = { ...r, chairs, R, arena: arenaFor(R, r.order.length), segs: choreography(r.seed), hazards: roundHazards(r.seed, r.level) }
      this.self = null
      this.snaps.clear()
      this.pendingSit = -1
    } else if (r) {
      Object.assign(this.round, r)
    } else {
      this.round = null
    }
    if (s.phase === 'scramble' && (!prev || prev.phase !== 'scramble')) this.beginScramble()
    this.emit('state', s, prev)
  }

  status(id = this.me) {
    return this.state?.status?.[id]
  }

  amAlive() {
    return !!this.status()?.alive
  }

  // --- Geometry ---------------------------------------------------------------------

  danceTau(hostT = this.hostNow()) {
    const r = this.round
    if (!r) return 0
    const end = r.stopAt ?? hostT
    return Math.max(0, (Math.min(hostT, end) - r.musicAt) / 1000)
  }

  chairPoints(hostT = this.hostNow()) {
    const r = this.round
    if (!r) return []
    return chairsAtTime(r, hostT)
  }

  // Where I'm running to: a spot, or a (moving) chair I clicked on.
  targetPoint(chairs = this.chairPoints()) {
    const t = this.input.target
    if (!t) return null
    if (t.chair != null) {
      if (this.state?.owners?.[t.chair]) return null
      const c = chairs[t.chair]
      if (!c) return null
      // Aim where the chair is about to be, not where it is: you cut it off
      // instead of trailing behind it.
      const me = this.self
      if (!me || !this.round) return c
      const lead = Math.min(700, (Math.hypot(c.x - me.x, c.y - me.y) / MOVE_SPEED) * 1000 * 0.9)
      return chairPosAt(this.round, t.chair, this.hostNow() + lead)
    }
    return t
  }

  dancePoint(id, tau) {
    const r = this.round
    const k = r.order.indexOf(id)
    if (k < 0) return null
    return dancePos(r.segs, k, r.order.length, tau, r.R)
  }

  beginScramble() {
    const r = this.round
    if (!r || !this.amAlive()) return
    const p = this.dancePoint(this.me, this.danceTau()) || { x: 0, y: 0 }
    this.self = { x: p.x, y: p.y, vx: 0, vy: 0 }
    this.pendingSit = -1
    // Nothing chosen during the music carries over: every chase starts at the stop.
    this.input.target = null
    this.sendPos(true)
  }

  // Positions for every visible player at this instant. Returns Map id -> {x,y,mode}.
  positions() {
    const out = new Map()
    const s = this.state
    if (!s) return out
    const hostT = this.hostNow()
    const r = this.round
    const phase = s.phase
    if (phase === 'lobby' || !r) {
      // Lobby: everyone mingles on a slow breathing ring.
      const ids = [...this.roster.values()].filter((p) => !p.spectator).map((p) => p.id)
      const tau = hostT / 1000
      ids.forEach((id, k) => {
        const p = patternPos('breathe', k, ids.length, tau * 0.35, 120 + ids.length * 6, 1)
        out.set(id, { x: p.x, y: p.y, mode: 'idle' })
      })
      return out
    }
    if (phase === 'levelup') {
      // Between levels: everybody is back on the floor, the level winner in the middle.
      const ids = [...this.roster.values()].filter((p) => !p.spectator && s.status[p.id] && p.id !== s.levelChamp).map((p) => p.id)
      const tau = hostT / 1000
      ids.forEach((id, k) => {
        const p = patternPos('orbit', k, ids.length, tau * 0.5, 120 + ids.length * 7, 1)
        out.set(id, { x: p.x, y: p.y, mode: 'dance' })
      })
      if (s.levelChamp) out.set(s.levelChamp, { x: 0, y: 0, mode: 'champ' })
      return out
    }
    if (phase === 'winner') {
      if (s.champion) out.set(s.champion, { x: 0, y: 0, mode: 'champ' })
      return out
    }
    const chairs = this.chairPoints(hostT)
    const tau = this.danceTau(hostT)
    for (const id of r.order) {
      const st = s.status[id]
      if (!st) continue
      if (st.seat >= 0 && chairs[st.seat]) {
        out.set(id, { x: chairs[st.seat].x, y: chairs[st.seat].y, mode: 'seated', face: chairs[st.seat].face })
        continue
      }
      if (phase === 'intro' || phase === 'music') {
        const p = this.dancePoint(id, phase === 'intro' ? 0 : tau)
        out.set(id, { ...p, mode: phase === 'music' ? 'dance' : 'ready' })
        continue
      }
      if (!st.alive && !s.booted.includes(id)) continue
      if (id === this.me && this.self) {
        out.set(id, { x: this.self.x, y: this.self.y, mode: st.alive ? 'run' : 'booted' })
        continue
      }
      const ip = this.interp(id)
      const fallback = this.dancePoint(id, tau)
      const p = ip || fallback || { x: st.x, y: st.y }
      out.set(id, { x: p.x, y: p.y, mode: st.alive ? 'run' : 'booted' })
    }
    return out
  }

  interp(id) {
    const buf = this.snaps.get(id)
    if (!buf || !buf.length) return null
    const t = Date.now() - INTERP_MS
    if (t <= buf[0].t) return buf[0]
    for (let i = buf.length - 1; i >= 0; i--) {
      if (buf[i].t <= t) {
        const a = buf[i]
        const b = buf[i + 1]
        if (!b) return a
        const u = (t - a.t) / (b.t - a.t)
        return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }
      }
    }
    return buf[buf.length - 1]
  }

  // --- Local movement during the scramble -------------------------------------------

  update(dt) {
    const s = this.state
    if (!s || s.phase !== 'scramble' || !this.self || !this.amAlive()) return
    if (this.status().seat >= 0) return
    const me = this.self
    const r = this.round
    const hostT = this.hostNow()
    const chairs = this.chairPoints(hostT)

    let dx = 0
    let dy = 0
    const k = this.input.keys
    if (k.has('ArrowLeft') || k.has('a') || k.has('A')) dx -= 1
    if (k.has('ArrowRight') || k.has('d') || k.has('D')) dx += 1
    if (k.has('ArrowUp') || k.has('w') || k.has('W')) dy -= 1
    if (k.has('ArrowDown') || k.has('s') || k.has('S')) dy += 1
    if (dx || dy) {
      // keys are screen-relative, even while the floor spins
      const yaw = this.viewYaw || 0
      const c = Math.cos(-yaw)
      const sn = Math.sin(-yaw)
      ;[dx, dy] = [dx * c - dy * sn, dx * sn + dy * c]
      this.input.target = null
    } else if (this.input.target) {
      const tp = this.targetPoint(chairs)
      if (!tp) this.input.target = null
      else {
        const tx = tp.x - me.x
        const ty = tp.y - me.y
        const d = Math.hypot(tx, ty)
        if (d > 4) { dx = tx / d; dy = ty / d } else if (this.input.target.chair == null) this.input.target = null
      }
    }
    const len = Math.hypot(dx, dy) || 1
    const pending = this.pendingSit >= 0 && Date.now() - this.pendingAt < 400
    const speed = pending ? 0 : MOVE_SPEED
    const ax = (dx / len) * speed
    const ay = (dy / len) * speed
    const resp = Math.min(1, dt * 14)
    me.vx += (ax - me.vx) * resp
    me.vy += (ay - me.vy) * resp
    me.x += me.vx * dt
    me.y += me.vy * dt

    // Bump off occupied chairs and other players so it feels physical.
    const owners = s.owners
    chairs.forEach((c, i) => {
      if (!owners[i] || owners[i] === this.me) return
      this.pushOut(me, c, CHAIR_RADIUS + PLAYER_RADIUS - 6)
    })
    // Bodies bump each other, except right next to a free chair: nobody can
    // block a seat by standing beside it (or by disconnecting there).
    const nearFree = chairs.some((ch, i) => !owners[i] && Math.hypot(ch.x - me.x, ch.y - me.y) < SIT_DISTANCE + PLAYER_RADIUS * 2.5)
    if (!nearFree) {
      for (const [id, p] of this.positions()) {
        if (id === this.me || p.mode !== 'run') continue
        this.pushOut(me, p, PLAYER_RADIUS * 1.6)
      }
    }
    if (r.hazards?.includes('bouncers')) {
      for (const b of bouncers(r, hostT)) this.pushOut(me, b, BOUNCER_RADIUS + PLAYER_RADIUS)
    }
    const c = clampToArena(me, r.arena)
    me.x = c.x
    me.y = c.y

    // Auto-sit when you reach a free chair.
    if (!pending) {
      chairs.forEach((ch, i) => {
        if (this.pendingSit >= 0 && Date.now() - this.pendingAt < 400) return
        if (owners[i]) return
        if (Math.hypot(ch.x - me.x, ch.y - me.y) <= SIT_DISTANCE) {
          this.pendingSit = i
          this.pendingAt = Date.now()
          this.send({ t: 'sit', chair: i, x: me.x, y: me.y, at: hostT })
        }
      })
    }
    this.sendPos(false)
  }

  // Push out of an obstacle and slide along it, so running straight into
  // something steers you around it instead of pinning you in place.
  pushOut(me, o, minD) {
    const dx = me.x - o.x
    const dy = me.y - o.y
    const d = Math.hypot(dx, dy)
    if (d > 0.01 && d < minD) {
      const nx = dx / d
      const ny = dy / d
      const overlap = minD - d
      const tx = -ny
      const ty = nx
      const side = Math.sign(me.vx * tx + me.vy * ty) || 1
      me.x = o.x + nx * minD + tx * side * overlap * 0.8
      me.y = o.y + ny * minD + ty * side * overlap * 0.8
    }
  }

  sendPos(force) {
    if (!this.self) return
    const now = Date.now()
    if (!force && now - this.lastPosSent < 60) return
    this.lastPosSent = now
    this.send({ t: 'pos', x: Math.round(this.self.x), y: Math.round(this.self.y) })
  }

  // Tap / click a spot (or a chair) to run there.
  setTarget(p) {
    if (this.state?.phase !== 'scramble' || !this.self) return false
    this.input.target = p
    return true
  }

  // Clicked / tapped a free chair: claim it and sit straight away (the host
  // decides if someone else got there first).
  grab(i) {
    if (this.state?.phase !== 'scramble' || !this.self) return false
    if (this.state.owners[i] || (this.pendingSit >= 0 && Date.now() - this.pendingAt < 400)) return false
    this.pendingSit = i
    this.pendingAt = Date.now()
    this.input.target = null
    this.send({ t: 'grab', chair: i, at: this.hostNow() })
    return true
  }

  // Out players: guess who goes out next.
  pick(id) {
    this.send({ t: 'pick', id })
  }

  react(e) {
    this.send({ t: 'react', e })
  }

  cmd(op, extra = {}) {
    this.send({ t: 'cmd', op, ...extra })
  }

  destroy() {
    clearInterval(this.pinger)
  }
}
