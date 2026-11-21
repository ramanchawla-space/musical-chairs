import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  chairCount, chairLayout, LAYOUTS, CHAIR_RADIUS, layoutRadius, choreography, dancePos,
  PATTERNS, patternPos, buildRound, chairsAt, ARENA_MARGIN, rng, musicDuration,
} from '../../src/core.js'

test('chair count: classic removes one, turbo removes a quarter', () => {
  assert.equal(chairCount(1), 0)
  assert.equal(chairCount(2), 1)
  assert.equal(chairCount(10), 9)
  assert.equal(chairCount(30), 29)
  assert.equal(chairCount(2, 'turbo'), 1)
  assert.equal(chairCount(4, 'turbo'), 3)
  assert.equal(chairCount(12, 'turbo'), 9)
  assert.equal(chairCount(40, 'turbo'), 30)
})

test('every layout produces the right number of non-overlapping chairs (1..60)', () => {
  for (const type of LAYOUTS) {
    for (let m = 1; m <= 60; m++) {
      const chairs = chairLayout(type, m)
      assert.equal(chairs.length, m, `${type} m=${m}`)
      for (let i = 0; i < m; i++) {
        assert.ok(Number.isFinite(chairs[i].x) && Number.isFinite(chairs[i].y))
        for (let j = i + 1; j < m; j++) {
          const d = Math.hypot(chairs[i].x - chairs[j].x, chairs[i].y - chairs[j].y)
          assert.ok(d >= CHAIR_RADIUS * 1.5, `${type} m=${m}: chairs ${i},${j} overlap (d=${d.toFixed(1)})`)
        }
      }
    }
  }
})

test('dance paths are smooth: no teleporting between frames, for every pattern and crowd size', () => {
  for (const n of [2, 3, 5, 8, 13, 21, 34]) {
    const R = layoutRadius(chairLayout('ring', n - 1))
    for (const seed of [1, 42, 999, 123456]) {
      const segs = choreography(seed)
      for (let k = 0; k < n; k++) {
        let prev = dancePos(segs, k, n, 0, R)
        for (let f = 1; f <= 60 * 40; f++) {
          const tau = f / 60
          const p = dancePos(segs, k, n, tau, R)
          const step = Math.hypot(p.x - prev.x, p.y - prev.y)
          // 60fps step; walking is ~140 u/s, allow generous headroom for blends.
          assert.ok(step < 25, `n=${n} seed=${seed} k=${k} t=${tau.toFixed(2)} step=${step.toFixed(1)}`)
          assert.ok(Math.hypot(p.x, p.y) <= R + ARENA_MARGIN, 'dancer left the floor')
          prev = p
        }
      }
    }
  }
})

test('conga patterns keep dancers spread out (no pile-ups)', () => {
  for (const name of ['orbit', 'wave', 'breathe', 'twin']) {
    for (const n of [4, 10, 25]) {
      const R = layoutRadius(chairLayout('ring', n - 1))
      for (const tau of [0, 3.3, 7.7, 15]) {
        const pts = Array.from({ length: n }, (_, k) => patternPos(name, k, n, tau, R, 1))
        let min = Infinity
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) min = Math.min(min, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y))
        assert.ok(min > 18, `${name} n=${n} tau=${tau}: min distance ${min.toFixed(1)}`)
      }
    }
  }
})

test('every pattern is used across choreographies, and all are deterministic', () => {
  const seen = new Set()
  for (let s = 0; s < 50; s++) for (const seg of choreography(s)) seen.add(seg.p)
  assert.deepEqual([...seen].sort(), [...PATTERNS].sort())
  assert.deepEqual(choreography(77), choreography(77))
  const a = buildRound(5, 1, ['a', 'b', 'c', 'd'], 'classic')
  const b = buildRound(5, 1, ['a', 'b', 'c', 'd'], 'classic')
  assert.deepEqual(a, b)
  assert.equal(a.chairs.length, 3)
  assert.equal(a.order.length, 4)
})

test('chairs spin during the music and are identical for everyone at the stop moment', () => {
  const r = buildRound(9, 2, ['a', 'b', 'c', 'd', 'e', 'f'], 'classic')
  const c0 = chairsAt(r, 0)
  const c5 = chairsAt(r, 5)
  assert.notDeepEqual(c0, c5)
  assert.deepEqual(chairsAt(r, 5), c5)
  // rotation preserves distances between chairs
  const d = (c) => Math.hypot(c[0].x - c[1].x, c[0].y - c[1].y)
  assert.ok(Math.abs(d(c0) - d(c5)) < 1e-9)
})

test('music duration is random but within bounds', () => {
  const rand = rng(3)
  for (let i = 0; i < 500; i++) {
    const c = musicDuration(rand, 'classic')
    const t = musicDuration(rand, 'turbo')
    assert.ok(c >= 11000 && c <= 26000)
    assert.ok(t >= 8000 && t <= 17000)
  }
})

test('random scatter: different every round, identical for everyone, never overlapping', async () => {
  const { pickLayout } = await import('../../src/core.js')
  const a = chairLayout('scatter', 12, 111)
  const b = chairLayout('scatter', 12, 222)
  assert.deepEqual(chairLayout('scatter', 12, 111), a, 'same seed -> same arrangement on every screen')
  assert.notDeepEqual(a, b, 'new seed -> new arrangement')
  for (const seed of [1, 7, 99, 12345, 987654]) {
    for (const m of [1, 2, 5, 9, 20, 40, 60]) {
      const ch = chairLayout('scatter', m, seed)
      assert.equal(ch.length, m)
      for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) {
        assert.ok(Math.hypot(ch[i].x - ch[j].x, ch[i].y - ch[j].y) >= CHAIR_RADIUS * 2.7 - 1e-9, `seed ${seed} m ${m} overlap`)
      }
    }
  }
  const rand = rng(5)
  for (let r = 1; r <= 20; r++) assert.equal(pickLayout(rand, r, 9, 'random'), 'scatter')
  assert.equal(buildRound(3, 1, ['a', 'b'], 'classic', 'random').layout, 'scatter', 'random mode scatters even a single chair')
})

test('every round plays a rave track with a hook, and every track gets played', async () => {
  const { roundTrack, TRACKS } = await import('../../src/audio.js')
  let melodic = 0
  const used = new Set()
  for (let s = 0; s < 1000; s++) {
    const i = roundTrack(s * 7919)
    assert.ok(i >= 0 && i < TRACKS.length)
    used.add(i)
    if (TRACKS[i].melody) melodic++
  }
  assert.ok(melodic >= 500, `${melodic}/1000 melodic`)
  assert.equal(used.size, TRACKS.length, 'every track gets played')
  for (const t of TRACKS.filter((x) => x.melody)) {
    assert.equal(t.melody.length, t.prog.length)
    for (const bar of t.melody) assert.equal(bar.length, 8)
  }
})

test('moving chairs: start exactly where they froze, stay on the floor, and are always catchable', async () => {
  const { chairMotion, MOVE_SPEED } = await import('../../src/core.js')
  for (const motion of ['drift', 'wild']) {
    for (const [layout, m] of [['ring', 3], ['scatter', 9], ['sunflower', 20], ['ring', 39], ['scatter', 59]]) {
      const chairs = chairLayout(layout, m, 42)
      const arena = layoutRadius(chairs) + ARENA_MARGIN
      let fastest = 0
      chairs.forEach((c, i) => {
        assert.deepEqual(chairMotion(c, i, 0, motion, arena), c, 'no jump at the stop moment')
        let prev = c
        for (let f = 1; f <= 60 * 12; f++) {
          const p = chairMotion(c, i, f / 60, motion, arena)
          fastest = Math.max(fastest, Math.hypot(p.x - prev.x, p.y - prev.y) * 60)
          assert.ok(Math.hypot(p.x, p.y) <= arena, 'chair left the floor')
          prev = p
        }
      })
      assert.ok(fastest < MOVE_SPEED * 0.75, `${motion} ${layout}/${m}: chairs reach ${fastest.toFixed(0)} u/s vs player ${MOVE_SPEED}`)
      assert.ok(fastest > 30, `${motion} chairs actually move (${fastest.toFixed(0)} u/s)`)
    }
  }
  const c = { x: 100, y: 0, face: 0 }
  assert.deepEqual(chairMotion(c, 0, 5, 'still', 500), c, 'still means still')
})

test('wild chairs roam the whole floor during AND after the music, never resting, always catchable', async () => {
  const { chairsAtTime, MOVE_SPEED } = await import('../../src/core.js')
  for (const [n, seed] of [[3, 11], [6, 202], [12, 3003], [30, 40404]]) {
    const r = buildRound(seed, 1, Array.from({ length: n }, (_, i) => 'p' + i), 'classic')
    const round = { ...r, motion: 'wild', musicAt: 10_000, stopAt: 25_000 }
    const atStart = chairsAtTime(round, 10_000)
    assert.deepEqual(atStart.map((c) => [c.x, c.y]), r.chairs.map((c) => [c.x, c.y]), 'round opens in its layout shape')
    // sample every chair across 40s (music + scramble)
    const seen = r.chairs.map(() => ({ minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }))
    let fastest = 0
    let prev = atStart
    let longestRest = 0
    const rest = r.chairs.map(() => 0)
    for (let f = 1; f <= 60 * 40; f++) {
      const t = 10_000 + (f * 1000) / 60
      const pts = chairsAtTime(round, t)
      pts.forEach((p, i) => {
        const v = Math.hypot(p.x - prev[i].x, p.y - prev[i].y) * 60
        fastest = Math.max(fastest, v)
        rest[i] = v < 5 ? rest[i] + 1 / 60 : 0
        longestRest = Math.max(longestRest, rest[i])
        assert.ok(Math.hypot(p.x, p.y) <= r.arena, 'chair left the floor')
        const b = seen[i]
        b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x)
        b.minY = Math.min(b.minY, p.y); b.maxY = Math.max(b.maxY, p.y)
      })
      prev = pts
    }
    assert.ok(fastest < MOVE_SPEED * 3.8, `n=${n}: chairs top out at ${fastest.toFixed(0)} u/s (players ${MOVE_SPEED}) — fast, but no teleporting`)
    assert.ok(longestRest < 0.4, `n=${n}: no chair rests longer than ${longestRest.toFixed(2)}s`)
    for (const b of seen) {
      assert.ok(b.maxX - b.minX > r.arena * 0.8 && b.maxY - b.minY > r.arena * 0.8, `n=${n}: every chair roams across the floor`)
    }
    // the identical path no matter how you query it (cache-independent)
    const later = chairsAtTime({ ...round, seed: seed }, 33_333)
    assert.deepEqual(later, chairsAtTime(round, 33_333))
  }
})

test('wild chairs never slow down when the music stops, and a determined chaser can still catch one', async () => {
  const { chairsAtTime, MOVE_SPEED, SIT_DISTANCE } = await import('../../src/core.js')
  for (const [n, seed] of [[2, 7], [3, 11], [12, 3003]]) {
    const r = buildRound(seed, 1, Array.from({ length: n }, (_, i) => 'p' + i), 'classic')
    const round = { ...r, motion: 'wild', musicAt: 0, stopAt: 15_000 }
    const avgSpeed = (from, to) => {
      let sum = 0
      let cnt = 0
      let prev = chairsAtTime(round, from)
      for (let t = from + 1000 / 60; t <= to; t += 1000 / 60) {
        const pts = chairsAtTime(round, t)
        pts.forEach((p, i) => { sum += Math.hypot(p.x - prev[i].x, p.y - prev[i].y) * 60; cnt++ })
        prev = pts
      }
      return sum / cnt
    }
    const before = avgSpeed(5_000, 15_000)
    const after = avgSpeed(15_000, 25_000)
    assert.ok(after > before * 1.1, `n=${n}: chairs speed up after the stop (${before.toFixed(0)} -> ${after.toFixed(0)} u/s)`)
    assert.ok(after > MOVE_SPEED * 0.75, `n=${n}: scramble chairs are genuinely fast (${after.toFixed(0)} u/s)`)
    // A chaser who aims a quarter-second ahead gets a chair within the scramble window.
    let caught = 0
    for (let b = 0; b < 8; b++) {
      const me = { x: Math.cos(b) * r.arena * 0.6, y: Math.sin(b) * r.arena * 0.6 }
      for (let f = 0; f < 60 * 10; f++) {
        const t = 15_000 + (f * 1000) / 60
        const pts = chairsAtTime(round, t)
        const near = pts.reduce((bi, p, i) => (Math.hypot(p.x - me.x, p.y - me.y) < Math.hypot(pts[bi].x - me.x, pts[bi].y - me.y) ? i : bi), 0)
        if (Math.hypot(pts[near].x - me.x, pts[near].y - me.y) <= SIT_DISTANCE) { caught++; break }
        const tg = chairsAtTime(round, t + 250)[near]
        const d = Math.hypot(tg.x - me.x, tg.y - me.y) || 1
        me.x += ((tg.x - me.x) / d) * (MOVE_SPEED / 60)
        me.y += ((tg.y - me.y) / d) * (MOVE_SPEED / 60)
      }
    }
    assert.ok(caught >= 6, `n=${n}: ${caught}/8 chasers caught a chair`)
  }
})

test('it gets harder as players are booted: faster chairs, more hazards, bigger floor for big crowds', async () => {
  const { chairsAtTime, difficulty, roundHazards, HAZARDS, arenaFor } = await import('../../src/core.js')
  const speedFor = (n) => {
    const r = buildRound(99, 1, Array.from({ length: n }, (_, i) => 'p' + i), 'classic')
    const round = { ...r, motion: 'wild', musicAt: 0, stopAt: 10_000 }
    let sum = 0
    let cnt = 0
    let prev = chairsAtTime(round, 10_000)
    for (let f = 1; f <= 600; f++) {
      const pts = chairsAtTime(round, 10_000 + (f * 1000) / 60)
      pts.forEach((p, i) => { sum += Math.hypot(p.x - prev[i].x, p.y - prev[i].y) * 60; cnt++ })
      prev = pts
    }
    return sum / cnt
  }
  assert.ok(speedFor(2) > speedFor(20) * 1.2, `final chair (${speedFor(2).toFixed(0)}) is faster than round-one chairs (${speedFor(20).toFixed(0)})`)
  assert.equal(difficulty(1), 1)
  assert.equal(difficulty(19), 0)
  let few = 0
  let many = 0
  for (let s = 0; s < 50; s++) {
    const a = roundHazards(s, 19, 1)
    const b = roundHazards(s, 1, 8)
    assert.ok(a.every((h) => HAZARDS.includes(h)))
    assert.deepEqual(roundHazards(s, 1, 8), b, 'hazards are deterministic')
    few += a.length
    many += b.length
  }
  assert.ok(many > few * 2, `final rounds stack more hazards (${many / 50} vs ${few / 50})`)
  assert.ok(arenaFor(200, 20) - arenaFor(200, 5) > 300, 'floor grows with the crowd')
  // relative to the starting crowd: round one is calm, the final is maximum
  assert.equal(difficulty(4, 5), 0, '5-player game opens at level 0')
  assert.equal(difficulty(1, 5), 1, 'and ends at max')
  assert.equal(difficulty(19, 20), 0)
  assert.ok(difficulty(10, 20) > 0.4 && difficulty(10, 20) < 0.6, 'half the field gone, halfway hard')
  assert.equal(difficulty(1, 2), 1, 'a 2-player game is a straight final')
})
