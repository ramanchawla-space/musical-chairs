// The game server — runs inside the HOST's browser tab.
//
// GitHub Pages can only serve static files, so one browser acts as the
// authority: it owns the roster, rounds, chair claims and eliminations. It is
// transport-agnostic (connect/message/disconnect + a send function per
// connection) so the exact same code runs over PeerJS in production, over a
// loopback for the host's own player, and over fakes in unit tests.

import {
  buildRound, chairsAt, chairMotion, chairCount, SIT_DISTANCE, MOTIONS, PLAYER_COLORS, THEMES, MODES, LAYOUT_MODES,
} from './core.js'

export const DEFAULT_TIMING = {
  intro: 3600,        // countdown before the music starts
  scrambleMax: 12000, // after the music stops, how long people get to sit
  settle: 900,        // pause after the last chair fills, so everyone sees it
  result: 4800,       // "BOOTED!" screen between rounds
  manualMax: 90000,   // DJ mode safety net: auto-stop if the DJ forgets
  snapHz: 15,
}

export class Hub {
  constructor(opts = {}) {
    this.now = opts.now || (() => Date.now())
    this.setTimeout = opts.setTimeout || ((f, ms) => setTimeout(f, ms))
    this.clearTimeout = opts.clearTimeout || ((h) => clearTimeout(h))
    this.setInterval = opts.setInterval || ((f, ms) => setInterval(f, ms))
    this.clearInterval = opts.clearInterval || ((h) => clearInterval(h))
    this.random = opts.random || Math.random
    this.timing = { ...DEFAULT_TIMING, ...(opts.timing || {}) }
    this.musicScale = opts.musicScale || 1
    this.hostConn = opts.hostConn || 'local'

    this.conns = new Map()     // connId -> { send, cid }
    this.players = new Map()   // cid -> player
    this.colorIdx = 0
    this.settings = { theme: 'neon', mode: 'classic', dj: 'auto', layout: 'mix', motion: 'wild' }
    this.phase = 'lobby'
    this.round = null
    this.owners = []
    this.booted = []
    this.champion = null
    this.notice = ''
    this.timer = null
    this.snapTimer = null
  }

  // --- Transport hooks -------------------------------------------------------

  connect(connId, send) {
    this.conns.set(connId, { send, cid: null })
  }

  disconnect(connId) {
    const c = this.conns.get(connId)
    this.conns.delete(connId)
    if (!c || !c.cid) return
    const p = this.players.get(c.cid)
    if (!p || p.conn !== connId) return
    p.connected = false
    p.conn = null
    if (this.phase === 'lobby' || p.spectator) this.players.delete(p.id)
    this.broadcastRoster()
    this.broadcastState()
    this.checkScrambleDone()
  }

  message(connId, msg) {
    const c = this.conns.get(connId)
    if (!c || !msg || typeof msg !== 'object') return
    if (msg.t === 'hello') return this.onHello(connId, c, msg)
    if (msg.t === 'ping') return c.send({ t: 'pong', c: msg.c, h: this.now() })
    const p = c.cid && this.players.get(c.cid)
    if (!p) return
    switch (msg.t) {
      case 'pos':
        if (Number.isFinite(msg.x) && Number.isFinite(msg.y)) { p.x = msg.x; p.y = msg.y }
        break
      case 'sit':
        this.onSit(p, msg)
        break
      case 'react':
        if (typeof msg.e === 'string' && msg.e.length <= 8) this.broadcast({ t: 'react', id: p.id, e: msg.e })
        break
      case 'cmd':
        if (connId === this.hostConn) this.onCommand(msg)
        break
    }
  }

  // --- Joining ---------------------------------------------------------------

  onHello(connId, c, msg) {
    const cid = String(msg.cid || connId).slice(0, 64)
    c.cid = cid
    let p = this.players.get(cid)
    const name = String(msg.name || 'Player').trim().slice(0, 18) || 'Player'
    const avatar = typeof msg.avatar === 'string' && msg.avatar.length < 60000 ? msg.avatar : 'a0'
    if (p) {
      // Same browser reconnecting (refresh / wifi blip): keep their place.
      p.conn = connId
      p.connected = true
      p.name = name
      p.avatar = avatar
    } else {
      const spectator = !!msg.spectator
      const inGame = this.phase !== 'lobby'
      p = {
        id: cid, conn: connId, connected: true, name, avatar, spectator,
        color: PLAYER_COLORS[this.colorIdx++ % PLAYER_COLORS.length],
        alive: !inGame && !spectator, waiting: inGame && !spectator,
        seat: -1, x: 0, y: 0, outRound: 0, wins: 0,
      }
      this.players.set(cid, p)
    }
    c.send({ t: 'welcome', you: cid, host: connId === this.hostConn })
    this.broadcastRoster()
    this.broadcastState()
  }

  // --- Host commands -----------------------------------------------------------

  onCommand(msg) {
    switch (msg.op) {
      case 'settings': {
        const s = msg.settings || {}
        if (THEMES.includes(s.theme)) this.settings.theme = s.theme
        if (this.phase === 'lobby' && MODES.includes(s.mode)) this.settings.mode = s.mode
        if (s.dj === 'auto' || s.dj === 'manual') this.settings.dj = s.dj
        // Takes effect from the next round, so it can change mid-game.
        if (LAYOUT_MODES.includes(s.layout)) this.settings.layout = s.layout
        if (MOTIONS.includes(s.motion)) this.settings.motion = s.motion
        this.broadcastState()
        break
      }
      case 'start': return this.startGame()
      case 'stop': return this.stopMusic()
      case 'lobby': return this.toLobby()
      case 'kick': {
        const p = this.players.get(msg.id)
        if (!p || msg.id === this.players.get(this.conns.get(this.hostConn)?.cid)?.id) return
        this.players.delete(msg.id)
        const conn = p.conn && this.conns.get(p.conn)
        if (conn) conn.send({ t: 'kicked' })
        this.broadcastRoster()
        this.broadcastState()
        this.checkScrambleDone()
        break
      }
    }
  }

  contenders() {
    return [...this.players.values()].filter((p) => !p.spectator && p.connected)
  }

  startGame() {
    if (this.phase !== 'lobby' && this.phase !== 'winner') return false
    const ready = this.contenders()
    if (ready.length < 2) {
      this.notice = 'Need at least 2 players to start'
      this.broadcastState()
      this.notice = ''
      return false
    }
    for (const p of this.players.values()) {
      const plays = !p.spectator && p.connected
      p.alive = plays
      p.waiting = false
      p.seat = -1
      p.outRound = 0
    }
    // Drop ghosts left over from the previous game.
    for (const [id, p] of [...this.players]) if (!p.connected) this.players.delete(id)
    this.champion = null
    this.booted = []
    this.broadcastRoster()
    this.startRound(1)
    return true
  }

  toLobby() {
    this.clearTimeout(this.timer)
    this.stopSnaps()
    this.phase = 'lobby'
    this.round = null
    this.owners = []
    this.booted = []
    for (const [id, p] of [...this.players]) {
      if (!p.connected) { this.players.delete(id); continue }
      p.alive = !p.spectator
      p.waiting = false
      p.seat = -1
    }
    this.broadcastRoster()
    this.broadcastState()
  }

  // --- Round flow ----------------------------------------------------------------

  alive() {
    return [...this.players.values()].filter((p) => p.alive)
  }

  startRound(no) {
    const aliveIds = this.alive().map((p) => p.id).sort()
    const seed = Math.floor(this.random() * 2 ** 31)
    const r = buildRound(seed, no, aliveIds, this.settings.mode, this.settings.layout)
    const t = this.now()
    this.round = {
      ...r,
      musicMs: Math.round(r.musicMs * this.musicScale),
      introAt: t,
      musicAt: t + this.timing.intro,
      stopAt: null,
      scrambleEnd: null,
      mode: this.settings.mode,
      motion: this.settings.motion,
    }
    this.owners = new Array(r.chairs.length).fill(null)
    for (const p of this.alive()) p.seat = -1
    this.booted = []
    this.phase = 'intro'
    this.broadcastState()
    this.schedule(this.timing.intro, () => this.startMusic())
  }

  startMusic() {
    this.phase = 'music'
    this.broadcastState()
    const ms = this.settings.dj === 'manual' ? this.timing.manualMax : this.round.musicMs
    this.schedule(ms, () => this.stopMusic())
  }

  stopMusic() {
    if (this.phase !== 'music') return false
    const r = this.round
    r.stopAt = this.now()
    r.scrambleEnd = r.stopAt + this.timing.scrambleMax
    // Everyone starts scrambling from exactly where the dance left them.
    const tau = (r.stopAt - r.musicAt) / 1000
    r.frozen = chairsAt(r, tau)
    this.phase = 'scramble'
    this.broadcastState()
    this.startSnaps()
    this.schedule(this.timing.scrambleMax, () => this.endRound(true))
    return true
  }

  onSit(p, msg) {
    if (this.phase !== 'scramble' || !p.alive || p.seat >= 0) return
    const i = msg.chair | 0
    const r = this.round
    const base = r.frozen[i]
    // Chairs move: judge the claim at the moment the player says they reached
    // it (clamped to the scramble window, so nobody can claim from the future).
    const at = Math.min(this.now(), Math.max(r.stopAt, Number.isFinite(msg.at) ? msg.at : this.now()))
    const chair = base && chairMotion(base, i, (at - r.stopAt) / 1000, r.motion, r.arena)
    if (!chair || this.owners[i]) {
      this.sendTo(p, { t: 'sitDenied', chair: i })
      return
    }
    // Loose anti-teleport check; positions are client-reported.
    const x = Number.isFinite(msg.x) ? msg.x : p.x
    const y = Number.isFinite(msg.y) ? msg.y : p.y
    if (Math.hypot(chair.x - x, chair.y - y) > SIT_DISTANCE + 20) {
      this.sendTo(p, { t: 'sitDenied', chair: i })
      return
    }
    this.owners[i] = p.id
    p.seat = i
    p.x = chair.x
    p.y = chair.y
    this.broadcastState()
    this.checkScrambleDone()
  }

  checkScrambleDone() {
    if (this.phase !== 'scramble') return
    const free = this.owners.filter((o) => !o).length
    const standing = this.alive().filter((p) => p.seat < 0 && p.connected).length
    if (free === 0 || standing === 0) {
      this.phase = 'settle'
      this.schedule(this.timing.settle, () => this.endRound(false))
    }
  }

  endRound(timedOut) {
    if (this.phase !== 'scramble' && this.phase !== 'settle') return
    this.stopSnaps()
    const alive = this.alive()
    const seated = alive.filter((p) => p.seat >= 0)
    if (seated.length === 0) {
      // Nobody managed to sit (everyone AFK?) — don't wipe the game, replay.
      this.notice = 'Nobody sat down! Replaying the round…'
      this.booted = []
    } else {
      this.booted = alive.filter((p) => p.seat < 0).map((p) => p.id)
      for (const id of this.booted) {
        const p = this.players.get(id)
        p.alive = false
        p.outRound = this.round.no
      }
      this.notice = timedOut && this.booted.length ? 'Time up!' : ''
    }
    const left = this.alive()
    this.phase = 'result'
    if (left.length <= 1) {
      // Show the final boot, then crown the champion.
      this.champion = left[0]?.id || seated[0]?.id || null
      this.broadcastState()
      this.notice = ''
      this.schedule(this.timing.result, () => this.crown())
      return
    }
    this.broadcastState()
    this.notice = ''
    const next = this.round.no + (this.booted.length ? 1 : 0)
    this.schedule(this.timing.result, () => this.startRound(next))
  }

  crown() {
    const champ = this.players.get(this.champion)
    if (champ) champ.wins++
    this.phase = 'winner'
    this.broadcastState()
  }

  schedule(ms, fn) {
    this.clearTimeout(this.timer)
    this.timer = this.setTimeout(fn, ms)
  }

  // --- Position relay (scramble only) ---------------------------------------------

  startSnaps() {
    this.stopSnaps()
    this.snapTimer = this.setInterval(() => {
      const p = {}
      for (const pl of this.alive()) p[pl.id] = [Math.round(pl.x), Math.round(pl.y)]
      this.broadcast({ t: 'snap', p })
    }, 1000 / this.timing.snapHz)
  }

  stopSnaps() {
    if (this.snapTimer) this.clearInterval(this.snapTimer)
    this.snapTimer = null
  }

  // --- Outbound -----------------------------------------------------------------

  sendTo(p, msg) {
    const c = p.conn && this.conns.get(p.conn)
    if (c) c.send(msg)
  }

  broadcast(msg) {
    for (const c of this.conns.values()) if (c.cid) c.send(msg)
  }

  broadcastRoster() {
    const players = [...this.players.values()].map((p) => ({
      id: p.id, name: p.name, avatar: p.avatar, color: p.color, spectator: p.spectator,
    }))
    this.broadcast({ t: 'roster', players })
  }

  snapshot() {
    const r = this.round
    const status = {}
    for (const p of this.players.values()) {
      status[p.id] = {
        alive: p.alive, seat: p.seat, waiting: p.waiting, out: p.outRound,
        on: p.connected, wins: p.wins, x: Math.round(p.x), y: Math.round(p.y),
      }
    }
    return {
      t: 'state',
      phase: this.phase === 'settle' ? 'scramble' : this.phase,
      settle: this.phase === 'settle',
      settings: { ...this.settings },
      round: r && {
        no: r.no, seed: r.seed, layout: r.layout, m: r.chairs.length, order: r.order,
        musicAt: r.musicAt, introAt: r.introAt, stopAt: r.stopAt, scrambleEnd: r.scrambleEnd,
        track: r.track, mode: r.mode, motion: r.motion,
      },
      owners: this.owners.slice(),
      status,
      booted: this.booted.slice(),
      champion: this.champion,
      notice: this.notice,
      nextChairs: chairCount(this.alive().length, this.settings.mode),
    }
  }

  broadcastState() {
    this.broadcast(this.snapshot())
  }

  destroy() {
    this.clearTimeout(this.timer)
    this.stopSnaps()
  }
}
