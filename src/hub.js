// The game server — runs inside the HOST's browser tab.
//
// GitHub Pages can only serve static files, so one browser acts as the
// authority: it owns the roster, rounds, chair claims and eliminations. It is
// transport-agnostic (connect/message/disconnect + a send function per
// connection) so the exact same code runs over PeerJS in production, over a
// loopback for the host's own player, and over fakes in unit tests.

import {
  buildRound, chairPosAt, chairCount, SIT_DISTANCE, MOTIONS, PLAYER_COLORS, THEMES, MODES, LAYOUT_MODES, TOTAL_LEVELS, seatSlot, TRACK_COUNT, POINTS, sitPoints, streakBonus, scrambleWindow,
  specialChairs, bonusTiles, chairKind, tileKind, chairBonus,
} from './core.js'

export const DEFAULT_TIMING = {
  intro: 3600,        // countdown before the music starts
  scrambleMax: 12000, // after the music stops, how long people get to sit
  settle: 900,        // pause after the last chair fills, so everyone sees it
  result: 4800,       // "BOOTED!" screen between rounds
  levelup: 7000,      // level results, then everyone is back in for the next level
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
    this.level = 0
    this.levelChamp = null
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
      case 'grab':
        // clicked / tapped the chair itself: sit on it right away
        this.onSit(p, msg, true)
        break
      case 'pick':
        this.onPick(p, msg)
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
      this.resetScore(p)
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
      case 'end': return this.endGame()
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
      this.resetScore(p)
      p.wins = 0
    }
    // Drop ghosts left over from the previous game.
    for (const [id, p] of [...this.players]) if (!p.connected) this.players.delete(id)
    this.champion = null
    this.broadcastRoster()
    this.startLevel(1)
    return true
  }

  // A new level: everyone still connected is back on the floor, whether they
  // were booted last level or joined mid-game. Points carry over.
  startLevel(level) {
    this.level = level
    this.levelChamp = null
    this.booted = []
    for (const p of this.players.values()) {
      const plays = !p.spectator && p.connected
      p.alive = plays
      p.waiting = false
      p.seat = -1
      p.outRound = 0
      p.streak = 0
    }
    this.startCount = this.alive().length // difficulty ramps from here to the level's final
    if (this.startCount < 2) return this.endGame()
    this.startRound(1)
  }

  // The host can end the game at any moment; so does finishing level 5.
  // Everyone keeps what they've scored and the most points wins.
  endGame() {
    if (this.phase === 'lobby' || this.phase === 'winner') return false
    this.stopSnaps()
    this.clearTimeout(this.timer)
    const ranked = [...this.players.values()].filter((p) => !p.spectator)
      .sort((a, b) => b.pts - a.pts || b.wins - a.wins || (a.bestSit ?? 1e9) - (b.bestSit ?? 1e9))
    this.champion = ranked[0]?.id || null
    this.phase = 'winner'
    this.broadcastState()
    return true
  }

  toLobby() {
    this.clearTimeout(this.timer)
    this.stopSnaps()
    this.phase = 'lobby'
    this.round = null
    this.owners = []
    this.booted = []
    this.level = 0
    this.levelChamp = null
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
    const r = buildRound(seed, no, aliveIds, this.settings.mode, this.settings.layout, this.startCount)
    // A different song every round: never the one that just played.
    if (Number.isFinite(this.lastTrack)) {
      r.track = (this.lastTrack % TRACK_COUNT) + 1 + Math.floor(this.random() * (TRACK_COUNT - 1))
    }
    this.lastTrack = r.track
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
      level: this.level,
      seats: new Array(r.chairs.length).fill(null), // [claimTime, tableSlot] once taken
      ...specialChairs(seed, r.chairs.length), // thrones, silvers
      ...bonusTiles(seed), // gold, silver
    }
    this.owners = new Array(r.chairs.length).fill(null)
    for (const p of this.alive()) p.seat = -1
    for (const p of this.players.values()) { p.gain = 0; p.sitMs = null; p.pick = null; p.pred = null; p.bonus = null }
    this.round.fastest = null
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
    const window = scrambleWindow(r, this.timing.scrambleMax)
    r.scrambleEnd = r.stopAt + window
    this.phase = 'scramble'
    this.broadcastState()
    this.startSnaps()
    this.schedule(window, () => this.endRound(true))
    return true
  }

  onSit(p, msg, grab = false) {
    if (this.phase !== 'scramble' || !p.alive || p.seat >= 0) return
    const i = msg.chair | 0
    const r = this.round
    // Chairs move: judge the claim at the moment the player says they reached
    // it (clamped to the scramble window, so nobody can claim from the future).
    const at = Math.min(this.now(), Math.max(r.stopAt, Number.isFinite(msg.at) ? msg.at : this.now()))
    const chair = r.chairs[i] && chairPosAt(r, i, at)
    if (!chair || this.owners[i]) {
      this.sendTo(p, { t: 'sitDenied', chair: i })
      return
    }
    // Loose anti-teleport check; positions are client-reported.
    const x = Number.isFinite(msg.x) ? msg.x : p.x
    const y = Number.isFinite(msg.y) ? msg.y : p.y
    if (!grab && Math.hypot(chair.x - x, chair.y - y) > SIT_DISTANCE + 40) {
      this.sendTo(p, { t: 'sitDenied', chair: i })
      return
    }
    // Points: the quicker you sit after the stop, the more you score.
    const order = r.seats.filter(Boolean).length
    const secs = Math.max(0, (at - r.stopAt) / 1000)
    // Special chairs and tiles: judged where the chair was at the moment of the claim.
    const ck = chairKind(r, i)
    const tk = tileKind(chair, r)
    const bonus = chairBonus(ck, tk)
    const pts = sitPoints(secs, order) + bonus.pts
    p.bonus = bonus.kind
    if (ck === 'throne') p.thrones++
    if (ck === 'silver') p.silvers++
    if (tk) p.tiles++
    if (bonus.kind === 'jackpot') p.jackpots++
    p.pts += pts
    p.gain += pts
    p.sitMs = Math.round(secs * 1000)
    if (p.bestSit == null || p.sitMs < p.bestSit) p.bestSit = p.sitMs
    if (order === 0) r.fastest = { id: p.id, ms: p.sitMs }
    this.owners[i] = p.id
    p.seat = i
    // The chair stops roaming and takes its sitter to the next seat at the table.
    r.seats[i] = [at, r.seats.filter(Boolean).length]
    const seatPos = seatSlot(r, r.seats[i][1])
    p.x = seatPos.x
    p.y = seatPos.y
    this.broadcastState()
    this.checkScrambleDone()
  }

  resetScore(p) {
    Object.assign(p, { pts: 0, gain: 0, streak: 0, sitMs: null, bestSit: null, bestStreak: 0, predHits: 0, pick: null, pred: null, bonus: null, thrones: 0, silvers: 0, tiles: 0, jackpots: 0 })
  }

  // Out (or waiting) players guess who'll be booted this round, until the music stops.
  onPick(p, msg) {
    if (this.phase !== 'intro' && this.phase !== 'music') return
    if (p.alive || p.spectator) return
    const target = this.players.get(msg.id)
    if (!target || !target.alive || target.id === p.id) return
    p.pick = target.id
    this.broadcastState()
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
        p.streak = 0
      }
      // survivors build a streak
      for (const p of seated) {
        p.streak++
        p.bestStreak = Math.max(p.bestStreak, p.streak)
        const bonus = streakBonus(p.streak)
        p.pts += bonus
        p.gain += bonus
      }
      // out players who called it
      for (const p of this.players.values()) {
        if (!p.pick) continue
        if (this.booted.includes(p.pick)) {
          p.pred = 'hit'
          p.predHits++
          p.pts += POINTS.predict
          p.gain += POINTS.predict
        } else p.pred = 'miss'
      }
      this.notice = timedOut && this.booted.length ? 'Time up!' : ''
    }
    const left = this.alive()
    this.phase = 'result'
    if (left.length <= 1) {
      // Show the final boot; the level's last one standing gets a bonus.
      this.levelChamp = left[0]?.id || seated[0]?.id || null
      const champ = this.players.get(this.levelChamp)
      if (champ) {
        champ.wins++
        champ.pts += POINTS.levelWin
        champ.gain += POINTS.levelWin
      }
      this.broadcastState()
      this.notice = ''
      this.schedule(this.timing.result, () => this.finishLevel())
      return
    }
    this.broadcastState()
    this.notice = ''
    const next = this.round.no + (this.booted.length ? 1 : 0)
    this.schedule(this.timing.result, () => this.startRound(next))
  }

  // Level over: after level 5 the game ends; otherwise a short break, then
  // everybody is back in for the next level.
  finishLevel() {
    if (this.phase !== 'result') return
    if (this.level >= TOTAL_LEVELS) return this.endGame()
    this.phase = 'levelup'
    this.broadcastState()
    this.schedule(this.timing.levelup, () => this.startLevel(this.level + 1))
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
        pts: p.pts, gain: p.gain, streak: p.streak, sitMs: p.sitMs, pick: p.pick, pred: p.pred,
        bestSit: p.bestSit, bestStreak: p.bestStreak, predHits: p.predHits,
        bonus: p.bonus, thrones: p.thrones, silvers: p.silvers, tiles: p.tiles, jackpots: p.jackpots,
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
        track: r.track, mode: r.mode, motion: r.motion, start: r.start, level: r.level, seats: r.seats, fastest: r.fastest,
        thrones: r.thrones, silvers: r.silvers, gold: r.gold, silver: r.silver,
      },
      owners: this.owners.slice(),
      status,
      booted: this.booted.slice(),
      champion: this.champion,
      level: this.level,
      levels: TOTAL_LEVELS,
      levelChamp: this.levelChamp,
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
