import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Hub } from '../../src/hub.js'
import { chairsAt, chairPosAt } from '../../src/core.js'

// Deterministic fake clock + timers so whole games run in milliseconds.
function fakeClock() {
  let now = 1_000_000
  let id = 0
  const timers = new Map()
  const api = {
    now: () => now,
    setTimeout: (fn, ms) => { timers.set(++id, { at: now + ms, fn }); return id },
    clearTimeout: (h) => timers.delete(h),
    setInterval: (fn, ms) => { const h = ++id; timers.set(h, { at: now + ms, fn, every: ms }); return h },
    clearInterval: (h) => timers.delete(h),
    advance(ms) {
      const end = now + ms
      for (;;) {
        let next = null
        for (const [h, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [h, t]
        if (!next) break
        const [h, t] = next
        now = t.at
        if (t.every) t.at += t.every
        else timers.delete(h)
        t.fn()
      }
      now = end
    },
  }
  return api
}

function setup(n, opts = {}) {
  const clock = fakeClock()
  let seed = 7
  const hub = new Hub({ ...clock, random: () => ((seed = (seed * 16807) % 2147483647) / 2147483647), ...opts })
  const inbox = new Map()
  const join = (connId, cid, extra = {}) => {
    inbox.set(connId, [])
    hub.connect(connId, (m) => inbox.get(connId).push(m))
    hub.message(connId, { t: 'hello', cid, name: cid, avatar: 'p1', ...extra })
  }
  join('local', 'host')
  for (let i = 1; i < n; i++) join('c' + i, 'p' + i)
  const last = (connId, type) => inbox.get(connId).filter((m) => m.t === type).at(-1)
  const cmd = (op, extra) => hub.message('local', { t: 'cmd', op, ...extra })
  const connOf = (cid) => (cid === 'host' ? 'local' : 'c' + cid.slice(1))
  // Seat a list of players onto the free chairs, in order.
  const seat = (cids) => {
    let i = 0
    for (const cid of cids) {
      while (hub.owners[i]) i++
      const c = chairPosAt(hub.round, i, hub.now())
      hub.message(connOf(cid), { t: 'sit', chair: i, x: c.x, y: c.y, at: hub.now() })
      i++
    }
  }
  return { hub, clock, inbox, join, last, cmd, seat, connOf }
}

// Through the level break (if any) to the next level's intro.
function skipLevelUp(env) {
  const { hub, clock } = env
  if (hub.phase === 'levelup') clock.advance(hub.timing.levelup + 1)
}

// Play rounds (everyone but the last in line sits) until `stop()` says so.
function playUntil(env, stop) {
  const { hub, clock, seat } = env
  while (!stop()) {
    skipLevelUp(env)
    if (stop()) break
    toScramble(env)
    seat(hub.round.order.slice(0, -1))
    clock.advance(hub.timing.settle + 1)
    if (stop()) break
    clock.advance(hub.timing.result + 1)
  }
}

function toScramble(env) {
  const { hub, clock } = env
  clock.advance(hub.timing.intro + 1)
  assert.equal(hub.phase, 'music')
  clock.advance(hub.round.musicMs + 1)
  assert.equal(hub.phase, 'scramble')
}

test('a 6-player classic level runs round by round to its last one standing, then everyone is back for the next level', () => {
  const env = setup(6)
  const { hub, clock, cmd, seat, last } = env
  cmd('start')
  assert.equal(hub.phase, 'intro')
  assert.equal(hub.round.level, 1)
  let rounds = 0
  while (hub.phase !== 'levelup') {
    rounds++
    const alive = hub.alive().map((p) => p.id)
    assert.equal(hub.round.chairs.length, alive.length - 1)
    toScramble(env)
    // Everyone but the last player in the conga order gets a seat.
    const order = hub.round.order
    const loser = order[order.length - 1]
    seat(order.slice(0, -1))
    clock.advance(hub.timing.settle + 1)
    assert.equal(hub.phase, 'result')
    assert.deepEqual(hub.booted, [loser])
    assert.equal(hub.players.get(loser).alive, false)
    clock.advance(hub.timing.result + 1)
  }
  assert.equal(rounds, 5)
  assert.equal(hub.alive().length, 1)
  const st = last('c3', 'state')
  assert.equal(st.phase, 'levelup')
  assert.equal(st.level, 1)
  assert.equal(st.levelChamp, hub.alive()[0].id)
  assert.equal(st.status[st.levelChamp].wins, 1)
  const booted = [...hub.players.values()].filter((p) => !p.alive)
  assert.ok(booted.filter((p) => p.outRound > 1).every((p) => p.pts > 0), 'booted players keep the points they earned')
  const kept = Object.fromEntries([...hub.players.values()].map((p) => [p.id, p.pts]))
  clock.advance(hub.timing.levelup + 1)
  assert.equal(hub.phase, 'intro')
  assert.equal(hub.round.level, 2, 'next level, automatically')
  assert.equal(hub.alive().length, 6, 'everyone is back in')
  assert.equal(hub.round.chairs.length, 5)
  for (const p of hub.players.values()) assert.equal(p.pts, kept[p.id], 'points carry over')
})

test('five levels then game over: the most points wins, whoever was last standing', () => {
  const env = setup(4)
  const { hub, cmd, last } = env
  cmd('start')
  const levels = new Set()
  playUntil(env, () => { if (hub.round) levels.add(hub.round.level); return hub.phase === 'winner' })
  assert.deepEqual([...levels], [1, 2, 3, 4, 5])
  const st = last('c1', 'state')
  assert.equal(st.phase, 'winner')
  const top = Math.max(...Object.values(st.status).map((x) => x.pts))
  assert.equal(st.status[st.champion].pts, top, 'champion has the most points')
  const wins = Object.values(st.status).reduce((n, x) => n + x.wins, 0)
  assert.equal(wins, 5, 'one level winner per level')
})

test('the host can end the game at any moment; points are kept and the podium shows', () => {
  const env = setup(4)
  const { hub, clock, cmd, seat } = env
  cmd('start')
  toScramble(env)
  seat(hub.round.order.slice(0, 2))
  hub.message('c1', { t: 'cmd', op: 'end' })
  assert.equal(hub.phase, 'scramble', 'players cannot end the game')
  const pts = Object.fromEntries([...hub.players.values()].map((p) => [p.id, p.pts]))
  cmd('end')
  assert.equal(hub.phase, 'winner')
  for (const p of hub.players.values()) assert.equal(p.pts, pts[p.id])
  assert.equal(hub.players.get(hub.champion).pts, Math.max(...Object.values(pts)))
  clock.advance(60000)
  assert.equal(hub.phase, 'winner', 'nothing else is scheduled')
  cmd('start')
  assert.equal(hub.phase, 'intro')
  assert.equal(hub.round.level, 1)
})

test('thrones, silver chairs and bonus tiles pay extra, judged where the chair is when grabbed', async () => {
  const { chairBonus, chairKind, tileKind, sitPoints } = await import('../../src/core.js')
  const env = setup(12)
  const { hub, clock, cmd } = env
  cmd('start')
  const r = hub.round
  assert.ok(r.thrones.length >= 1 && r.silvers.length >= 1 && r.gold.length && r.silver.length)
  const st = env.last('c1', 'state').round
  assert.deepEqual(st.thrones, r.thrones, 'clients learn the special chairs')
  assert.deepEqual(st.gold, r.gold, 'and the tiles')
  toScramble(env)
  clock.advance(500)
  const now = hub.now()
  const i = r.thrones[0]
  const pos = chairPosAt(r, i, now)
  const expected = sitPoints(0.5, 0) + chairBonus('throne', tileKind(pos, r)).pts
  hub.message('c1', { t: 'grab', chair: i, at: now })
  const p1 = hub.players.get('p1')
  assert.equal(p1.pts, expected)
  assert.equal(chairKind(r, i), 'throne')
  assert.ok(['throne', 'royal', 'jackpot'].includes(p1.bonus))
  assert.equal(p1.thrones, 1)
  const j = r.silvers[0]
  hub.message('c2', { t: 'grab', chair: j, at: now })
  const p2 = hub.players.get('p2')
  assert.ok(['silver', 'golden', 'sterling'].includes(p2.bonus))
  assert.equal(p2.silvers, 1)
  // jackpot: find a moment when the throne sits on a gold tile
  const k = r.chairs.findIndex((_, n) => !r.thrones.includes(n) && !r.silvers.includes(n) && !hub.owners[n])
  for (let t = now; t < r.scrambleEnd; t += 20) {
    if (tileKind(chairPosAt(r, k, t), r)) {
      clock.advance(t - hub.now())
      hub.message('c3', { t: 'grab', chair: k, at: t })
      assert.ok(['gold', 'silvertile'].includes(hub.players.get('p3').bonus), 'a plain chair on a bonus tile')
      assert.equal(hub.players.get('p3').tiles, 1)
      break
    }
  }
})

test('two players racing for the same chair: first claim wins, second is denied', () => {
  const env = setup(3)
  const { hub, cmd, inbox } = env
  cmd('start')
  toScramble(env)
  const c = chairPosAt(hub.round, 0, hub.now())
  hub.message('c1', { t: 'sit', chair: 0, x: c.x, y: c.y })
  hub.message('c2', { t: 'sit', chair: 0, x: c.x, y: c.y })
  assert.equal(hub.owners[0], 'p1')
  assert.equal(hub.players.get('p2').seat, -1)
  assert.ok(inbox.get('c2').some((m) => m.t === 'sitDenied'))
})

test('sitting from across the floor is rejected', () => {
  const env = setup(3)
  const { hub, cmd } = env
  cmd('start')
  toScramble(env)
  const c = chairPosAt(hub.round, 0, hub.now())
  hub.message('c1', { t: 'sit', chair: 0, x: c.x + 300, y: c.y })
  assert.equal(hub.owners[0], null)
})

test('cannot sit while the music is still playing', () => {
  const env = setup(3)
  const { hub, clock, cmd } = env
  cmd('start')
  clock.advance(hub.timing.intro + 1)
  const c = chairPosAt(hub.round, 0, hub.now())
  hub.message('c1', { t: 'sit', chair: 0, x: c.x, y: c.y })
  assert.equal(hub.owners[0], null)
})

test('scramble timeout boots everyone still standing', () => {
  const env = setup(5)
  const { hub, clock, cmd, seat } = env
  cmd('start')
  toScramble(env)
  seat([hub.round.order[0]])
  clock.advance(hub.timing.scrambleMax + 1)
  assert.equal(hub.phase, 'result')
  assert.equal(hub.booted.length, 4)
  clock.advance(hub.timing.result + 1)
  assert.equal(hub.phase, 'levelup', 'level over, the booted come back next level')
})

test('if nobody sits at all the round is replayed instead of wiping everyone', () => {
  const env = setup(4)
  const { hub, clock, cmd } = env
  cmd('start')
  toScramble(env)
  clock.advance(hub.timing.scrambleMax + 1)
  assert.equal(hub.phase, 'result')
  assert.equal(hub.booted.length, 0)
  assert.equal(hub.alive().length, 4)
  clock.advance(hub.timing.result + 1)
  assert.equal(hub.phase, 'intro')
  assert.equal(hub.round.no, 1)
})

test('turbo mode removes a quarter of the field per round', () => {
  const env = setup(12)
  const { hub, cmd } = env
  cmd('settings', { settings: { mode: 'turbo' } })
  cmd('start')
  assert.equal(hub.round.chairs.length, 9)
})

test('host DJ mode: music plays until the host hits stop', () => {
  const env = setup(3)
  const { hub, clock, cmd } = env
  cmd('settings', { settings: { dj: 'manual' } })
  cmd('start')
  clock.advance(hub.timing.intro + 1)
  clock.advance(60000)
  assert.equal(hub.phase, 'music')
  cmd('stop')
  assert.equal(hub.phase, 'scramble')
})

test('only the host can send commands', () => {
  const env = setup(3)
  const { hub } = env
  hub.message('c1', { t: 'cmd', op: 'start' })
  assert.equal(hub.phase, 'lobby')
  hub.message('c1', { t: 'cmd', op: 'settings', settings: { theme: 'cosmic' } })
  assert.equal(hub.settings.theme, 'neon')
})

test('need two players to start', () => {
  const env = setup(1)
  env.cmd('start')
  assert.equal(env.hub.phase, 'lobby')
})

test('host can watch on a big screen without playing', () => {
  const clock = fakeClock()
  const hub = new Hub(clock)
  hub.connect('local', () => {})
  hub.message('local', { t: 'hello', cid: 'host', name: 'Host', spectator: true })
  for (const i of [1, 2, 3]) {
    hub.connect('c' + i, () => {})
    hub.message('c' + i, { t: 'hello', cid: 'p' + i, name: 'P' + i })
  }
  hub.message('local', { t: 'cmd', op: 'start' })
  assert.equal(hub.alive().length, 3)
  assert.equal(hub.round.chairs.length, 2)
  assert.ok(!hub.round.order.includes('host'))
})

test('late joiners wait for the next game; reconnecting players keep their place', () => {
  const env = setup(4)
  const { hub, cmd, join, clock } = env
  cmd('start')
  join('late', 'latecomer')
  assert.equal(hub.players.get('latecomer').alive, false)
  assert.equal(hub.players.get('latecomer').waiting, true)
  // p2's wifi blips; they come back on a new connection with the same id.
  hub.disconnect('c2')
  assert.equal(hub.players.get('p2').connected, false)
  join('c2b', 'p2')
  assert.equal(hub.players.get('p2').connected, true)
  assert.equal(hub.players.get('p2').alive, true)
  clock.advance(hub.timing.intro + 1)
  assert.equal(hub.phase, 'music')
})

test('a player dropping mid-scramble does not hang the round', () => {
  const env = setup(4)
  const { hub, clock, cmd, seat } = env
  cmd('start')
  toScramble(env)
  const order = hub.round.order
  const dropper = order.find((id) => id !== 'host')
  const rest = order.filter((id) => id !== dropper)
  seat(rest)
  // All chairs are now full → round ends without waiting for the dropper.
  hub.disconnect(env.connOf(dropper))
  clock.advance(hub.timing.settle + 1)
  assert.equal(hub.phase, 'result')
  assert.deepEqual(hub.booted, [dropper])
})

test('round ends early when every connected player is seated even if chairs remain', () => {
  const env = setup(5)
  const { hub, clock, cmd, seat } = env
  cmd('start')
  toScramble(env)
  const order = hub.round.order
  // two players vanish; the remaining three take chairs, one chair stays free
  const gone = order.filter((id) => id !== 'host').slice(0, 2)
  for (const id of gone) hub.disconnect(env.connOf(id))
  seat(order.filter((id) => !gone.includes(id)))
  clock.advance(hub.timing.settle + 1)
  assert.equal(hub.phase, 'result')
  assert.deepEqual(hub.booted.sort(), gone.sort())
})

test('play again resets everyone; back-to-lobby clears the round', () => {
  const env = setup(3)
  const { hub, clock, cmd, seat } = env
  cmd('start')
  playUntil(env, () => hub.phase === 'winner')
  cmd('start')
  assert.equal(hub.phase, 'intro')
  assert.equal(hub.alive().length, 3)
  assert.ok([...hub.players.values()].every((p) => p.pts === 0 && p.wins === 0))
  cmd('lobby')
  assert.equal(hub.phase, 'lobby')
  assert.equal(hub.round, null)
})

test('positions are relayed during the scramble only', () => {
  const env = setup(3)
  const { hub, clock, cmd, inbox } = env
  cmd('start')
  clock.advance(hub.timing.intro + 2000)
  assert.equal(inbox.get('c1').filter((m) => m.t === 'snap').length, 0)
  clock.advance(hub.round.musicMs)
  hub.message('c2', { t: 'pos', x: 12, y: 34 })
  clock.advance(500)
  const snap = inbox.get('c1').filter((m) => m.t === 'snap').at(-1)
  assert.deepEqual(snap.p.p2, [12, 34])
})

test('state snapshots are JSON-safe and never include avatar blobs', () => {
  const env = setup(3)
  env.cmd('start')
  const st = env.last('c1', 'state')
  assert.deepEqual(JSON.parse(JSON.stringify(st)), st)
  assert.ok(!JSON.stringify(st).includes('avatar'))
})

test('a 40-person team in turbo mode finishes in a sensible number of rounds', () => {
  const env = setup(40)
  const { hub, clock, cmd, seat } = env
  cmd('settings', { settings: { mode: 'turbo' } })
  cmd('start')
  let rounds = 0
  while (hub.phase !== 'levelup') {
    rounds++
    assert.equal(hub.round.order.length, hub.alive().length)
    toScramble(env)
    // Everyone scrambles; whoever is left standing when chairs run out is out.
    seat(hub.round.order.slice(0, hub.round.chairs.length))
    clock.advance(hub.timing.settle + hub.timing.result + 2)
  }
  assert.ok(rounds <= 12, `took ${rounds} rounds`)
  assert.equal(hub.alive().length, 1)
})

test('host can switch chairs to random-anywhere, and it applies from the next round', () => {
  const env = setup(6)
  const { hub, clock, cmd, seat } = env
  cmd('settings', { settings: { layout: 'random' } })
  cmd('start')
  assert.equal(hub.round.layout, 'scatter')
  toScramble(env)
  seat(hub.round.order.slice(0, -1))
  cmd('settings', { settings: { layout: 'mix' } })
  assert.equal(hub.settings.layout, 'mix')
  const st = env.last('c1', 'state')
  assert.equal(st.settings.layout, 'mix')
  clock.advance(hub.timing.settle + hub.timing.result + 2)
  assert.equal(hub.phase, 'intro')
  hub.message('c1', { t: 'cmd', op: 'settings', settings: { layout: 'random' } })
  assert.equal(hub.settings.layout, 'mix', 'players cannot change it')
})

test('moving chairs: claims are judged where the chair is at that moment', () => {
  const env = setup(4)
  const { hub, clock, cmd } = env
  assert.equal(hub.settings.motion, 'wild', 'wild is the default')
  cmd('settings', { settings: { level: 4 } })
  assert.equal(hub.settings.level, undefined, 'the level is not a host setting: the game climbs through all five')
  cmd('start')
  toScramble(env)
  const r = hub.round
  assert.equal(r.level, 1, 'the game starts at level 1')
  r.level = 4 // fast chairs for this check
  const atStop = chairPosAt(r, 0, r.stopAt)
  clock.advance(2000)
  const now = hub.now()
  // Standing where the chair WAS when the music stopped no longer works...
  hub.message('c1', { t: 'sit', chair: 0, x: atStop.x, y: atStop.y, at: now })
  assert.equal(hub.owners[0], null, 'stale position rejected')
  // ...you have to be where it is now.
  const c0 = chairPosAt(r, 0, now)
  hub.message('c1', { t: 'sit', chair: 0, x: c0.x, y: c0.y, at: now })
  assert.equal(hub.owners[0], 'p1')
  // A claim stamped in the future is clamped to now (no predicting the chair).
  const future = chairPosAt(r, 1, now + 3000)
  const c1now = chairPosAt(r, 1, now)
  if (Math.hypot(future.x - c1now.x, future.y - c1now.y) > 60) {
    hub.message('c2', { t: 'sit', chair: 1, x: future.x, y: future.y, at: now + 3000 })
    assert.equal(hub.owners[1], null)
  }
  cmd('settings', { settings: { motion: 'still' } })
  assert.equal(hub.settings.motion, 'still')
  assert.equal(hub.round.motion, 'wild', 'current round keeps its motion; the change applies next round')
})

test('every round carries the starting crowd size, so all screens agree on the difficulty level', () => {
  const { hub, last, cmd } = setup(6)
  cmd('start')
  assert.equal(hub.round.start, 6)
  assert.equal(last('c1', 'state').round.start, 6, 'clients get the starting count')
  assert.equal(hub.round.arena > 0, true)
})

test('a taken chair stops roaming and carries its sitter to the round table; free chairs keep roaming clear of it', async () => {
  const { roundTable, seatSlot, SEAT_GLIDE_MS } = await import('../../src/core.js')
  const env = setup(4)
  const { hub, clock, cmd } = env
  cmd('start')
  toScramble(env)
  const r = hub.round
  clock.advance(500)
  const now = hub.now()
  const c0 = chairPosAt(r, 0, now)
  hub.message('c1', { t: 'sit', chair: 0, x: c0.x, y: c0.y, at: now })
  assert.equal(hub.owners[0], 'p1')
  assert.deepEqual(r.seats[0], [now, 0], 'claim time and table slot recorded')
  assert.ok(hub.snapshot().round.seats[0], 'seats go out to every screen')
  // no jump at the moment of sitting
  const atClaim = chairPosAt(r, 0, now)
  assert.ok(Math.hypot(atClaim.x - c0.x, atClaim.y - c0.y) < 1e-6, 'no jump when you sit')
  // after the glide it sits still at its table seat
  const slot = seatSlot(r, 0)
  const later = [now + SEAT_GLIDE_MS + 10, now + SEAT_GLIDE_MS + 2000, now + 8000].map((t) => chairPosAt(r, 0, t))
  for (const p of later) {
    assert.ok(Math.hypot(p.x - slot.x, p.y - slot.y) < 1e-6, 'taken chair stays put at the table')
  }
  assert.ok(Math.abs(Math.hypot(slot.x, slot.y) - roundTable(r).ring) < 1e-6)
  // the free chairs keep moving and never enter the table area
  const { keepOut } = roundTable(r)
  for (let i = 1; i < r.chairs.length; i++) {
    const a = chairPosAt(r, i, now + 2000)
    const b = chairPosAt(r, i, now + 3000)
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 5, `free chair ${i} still moving`)
    for (let t = now + 1500; t < now + 9000; t += 50) {
      const p = chairPosAt(r, i, t)
      assert.ok(Math.hypot(p.x, p.y) >= keepOut - 1e-6, `free chair ${i} stays clear of the table`)
    }
  }
  // the sitter is placed at their table seat
  assert.ok(Math.hypot(hub.players.get('p1').x - slot.x, hub.players.get('p1').y - slot.y) < 1)
})

test('a different song every round, and the one-chair final gets the showdown track', async () => {
  const { TRACKS, FINAL_TRACK, roundTrack } = await import('../../src/audio.js')
  const { TRACK_COUNT } = await import('../../src/core.js')
  assert.equal(TRACKS.length, TRACK_COUNT)
  assert.ok(!TRACKS.includes(FINAL_TRACK), 'the showdown is kept for the final')
  assert.ok(FINAL_TRACK.bpm > Math.max(...TRACKS.map((t) => t.bpm)), 'the final is the quickest track')
  for (const bar of FINAL_TRACK.melody) assert.equal(bar.length, 8)
  const env = setup(10)
  const { hub, clock, cmd, seat } = env
  cmd('start')
  const songs = []
  while (hub.phase !== 'levelup') {
    songs.push(roundTrack(hub.round.track))
    toScramble(env)
    seat(hub.round.order.slice(0, -1))
    clock.advance(hub.timing.settle + hub.timing.result + 2)
  }
  assert.equal(songs.length, 9)
  for (let i = 1; i < songs.length; i++) assert.notEqual(songs[i], songs[i - 1], `round ${i + 1} changes the song`)
  assert.ok(new Set(songs).size >= 5, `plenty of variety (${songs.join(',')})`)
})

test('points: faster sits score more, first down gets a bonus, streaks build, out players score by calling the next boot, level winner bonus', async () => {
  const { POINTS, sitPoints, streakBonus } = await import('../../src/core.js')
  assert.ok(sitPoints(0.5, 1) > sitPoints(3, 1), 'faster is worth more')
  assert.equal(sitPoints(0.5, 0) - sitPoints(0.5, 1), POINTS.first)
  assert.equal(sitPoints(60, 3), POINTS.sit, 'a slow sit still scores')
  assert.equal(streakBonus(1), 0)
  assert.equal(streakBonus(3), POINTS.streak * 2)

  const env = setup(4)
  const { hub, clock, cmd, connOf } = env
  cmd('start')
  toScramble(env)
  const r = hub.round
  const order = r.order
  const [fast, slow, mid, loser] = order
  // no special chairs or tiles here, so their bonuses don't muddle the comparison
  const sitNow = (cid, i) => {
    Object.assign(hub.round, { thrones: [], silvers: [], gold: [], silver: [] })
    const c = chairPosAt(hub.round, i, hub.now())
    hub.message(connOf(cid), { t: 'sit', chair: i, x: c.x, y: c.y, at: hub.now() })
  }
  clock.advance(400)
  sitNow(fast, 0)
  clock.advance(1500)
  sitNow(mid, 1)
  clock.advance(1500)
  sitNow(slow, 2)
  const P = (id) => hub.players.get(id)
  assert.ok(P(fast).pts > P(mid).pts && P(mid).pts > P(slow).pts, `quicker sits score more (${P(fast).pts} > ${P(mid).pts} > ${P(slow).pts})`)
  assert.deepEqual(hub.snapshot().round.fastest, { id: fast, ms: P(fast).sitMs })
  clock.advance(hub.timing.settle + 1)
  assert.equal(hub.phase, 'result')
  assert.deepEqual(hub.booted, [loser])
  assert.equal(P(fast).streak, 1)
  assert.equal(P(loser).pts, 0)

  // Round 2: the booted player predicts; picks lock when the music stops.
  clock.advance(hub.timing.result + 1)
  assert.equal(hub.phase, 'intro')
  const r2 = hub.round
  const target = r2.order[r2.order.length - 1]
  hub.message(connOf(loser), { t: 'pick', id: loser })
  assert.equal(P(loser).pick, null, "can't pick yourself")
  hub.message(connOf(fast === target ? slow : fast), { t: 'pick', id: target })
  assert.equal(P(fast === target ? slow : fast).pick, null, 'players still in cannot pick')
  hub.message(connOf(loser), { t: 'pick', id: target })
  assert.equal(P(loser).pick, target)
  assert.equal(hub.snapshot().status[loser].pick, target)
  toScramble(env)
  hub.message(connOf(loser), { t: 'pick', id: r2.order[0] })
  assert.equal(P(loser).pick, target, 'picks lock once the music stops')
  const before = P(loser).pts
  const survivors = r2.order.slice(0, -1)
  survivors.forEach((cid, i) => sitNow(cid, i))
  clock.advance(hub.timing.settle + 1)
  assert.deepEqual(hub.booted, [target])
  assert.equal(P(loser).pts - before, POINTS.predict, 'called it!')
  assert.equal(P(loser).pred, 'hit')
  const twice = survivors.find((id) => P(id).streak === 2)
  assert.ok(twice, 'a two-round survivor')
  // play on to the level's last one standing
  while (hub.phase !== 'levelup') {
    clock.advance(hub.timing.result + 1)
    if (hub.phase === 'levelup') break
    toScramble(env)
    hub.round.order.slice(0, -1).forEach((cid, i) => sitNow(cid, i))
    clock.advance(hub.timing.settle + 1)
  }
  const champ = P(hub.levelChamp)
  assert.ok(champ.gain >= POINTS.levelWin, 'level winner bonus')
  cmd('end')
  // a new game starts everyone from zero
  cmd('start')
  assert.ok([...hub.players.values()].every((p) => p.pts === 0 && p.streak === 0))
})

test('clicking a chair grabs it on the spot (first click wins), and higher levels give less time to sit', async () => {
  const { scrambleWindow } = await import('../../src/core.js')
  assert.ok(scrambleWindow({ level: 5 }, 12000) < scrambleWindow({ level: 1 }, 12000))
  const env = setup(3)
  const { hub, clock, cmd } = env
  cmd('settings', { settings: { level: 4 } })
  cmd('start')
  toScramble(env)
  const r = hub.round
  assert.equal(r.scrambleEnd - r.stopAt, scrambleWindow(r, hub.timing.scrambleMax), 'level sets the window')
  clock.advance(300)
  // p1 is nowhere near chair 0, but clicked it: grabbed
  hub.players.get('p1').x = 5000
  hub.message('c1', { t: 'grab', chair: 0, at: hub.now() })
  assert.equal(hub.owners[0], 'p1')
  assert.equal(hub.players.get('p1').seat, 0)
  // a second click on the same chair is denied
  hub.message('c2', { t: 'grab', chair: 0, at: hub.now() })
  assert.equal(hub.owners[0], 'p1')
  assert.equal(hub.players.get('p2').seat, -1)
  // a plain walk-up still has to be next to the chair
  hub.message('c2', { t: 'sit', chair: 1, x: 9999, y: 9999, at: hub.now() })
  assert.equal(hub.owners[1], null)
})
