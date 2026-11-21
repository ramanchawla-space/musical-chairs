import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Hub } from '../../src/hub.js'
import { chairsAt } from '../../src/core.js'

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
    const chairs = hub.round.frozen
    let i = 0
    for (const cid of cids) {
      while (hub.owners[i]) i++
      const c = chairs[i]
      hub.message(connOf(cid), { t: 'sit', chair: i, x: c.x, y: c.y })
      i++
    }
  }
  return { hub, clock, inbox, join, last, cmd, seat, connOf }
}

function toScramble(env) {
  const { hub, clock } = env
  clock.advance(hub.timing.intro + 1)
  assert.equal(hub.phase, 'music')
  clock.advance(hub.round.musicMs + 1)
  assert.equal(hub.phase, 'scramble')
}

test('a 6-player classic game runs round by round to a single champion', () => {
  const env = setup(6)
  const { hub, clock, cmd, seat, last } = env
  cmd('start')
  assert.equal(hub.phase, 'intro')
  let rounds = 0
  while (hub.phase !== 'winner') {
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
  assert.equal(st.phase, 'winner')
  assert.equal(st.champion, hub.alive()[0].id)
  assert.equal(st.status[st.champion].wins, 1)
})

test('two players racing for the same chair: first claim wins, second is denied', () => {
  const env = setup(3)
  const { hub, cmd, inbox } = env
  cmd('start')
  toScramble(env)
  const c = hub.round.frozen[0]
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
  const c = hub.round.frozen[0]
  hub.message('c1', { t: 'sit', chair: 0, x: c.x + 300, y: c.y })
  assert.equal(hub.owners[0], null)
})

test('cannot sit while the music is still playing', () => {
  const env = setup(3)
  const { hub, clock, cmd } = env
  cmd('start')
  clock.advance(hub.timing.intro + 1)
  const c = chairsAt(hub.round, 0)[0]
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
  assert.equal(hub.phase, 'winner')
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
  while (hub.phase !== 'winner') {
    toScramble(env)
    seat(hub.round.order.slice(0, -1))
    clock.advance(hub.timing.settle + hub.timing.result + 2)
  }
  cmd('start')
  assert.equal(hub.phase, 'intro')
  assert.equal(hub.alive().length, 3)
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
  while (hub.phase !== 'winner') {
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

test('moving chairs: claims are judged where the chair is at that moment', async () => {
  const { chairMotion } = await import('../../src/core.js')
  const env = setup(4)
  const { hub, clock, cmd } = env
  assert.equal(hub.settings.motion, 'wild', 'wild is the default')
  cmd('start')
  toScramble(env)
  const r = hub.round
  clock.advance(2000)
  const now = hub.now()
  const at = (i) => chairMotion(r.frozen[i], i, (now - r.stopAt) / 1000, 'wild', r.arena)
  // Sitting where the chair WAS when the music stopped no longer works...
  hub.message('c1', { t: 'sit', chair: 0, x: r.frozen[0].x, y: r.frozen[0].y, at: now })
  assert.equal(hub.owners[0], null, 'stale position rejected')
  // ...you have to be where it is now.
  hub.message('c1', { t: 'sit', chair: 0, x: at(0).x, y: at(0).y, at: now })
  assert.equal(hub.owners[0], 'p1')
  // A claim stamped in the future is clamped to now (no predicting the chair).
  const future = chairMotion(r.frozen[1], 1, (now + 3000 - r.stopAt) / 1000, 'wild', r.arena)
  hub.message('c2', { t: 'sit', chair: 1, x: future.x, y: future.y, at: now + 3000 })
  assert.equal(hub.owners[1], null)
  cmd('settings', { settings: { motion: 'still' } })
  assert.equal(hub.settings.motion, 'still')
  assert.equal(hub.round.motion, 'wild', 'current round keeps its motion; the change applies next round')
})
