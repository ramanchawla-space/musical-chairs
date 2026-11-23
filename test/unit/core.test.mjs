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

test('music duration is unpredictable: some sudden stops, some long plays, mostly in between', () => {
  const rand = rng(3)
  let short = 0
  let long = 0
  const n = 1000
  for (let i = 0; i < n; i++) {
    const c = musicDuration(rand, 'classic')
    const t = musicDuration(rand, 'turbo')
    assert.ok(c >= 3500 && c <= 40000, `classic ${c}`)
    assert.ok(t >= 3500 * 0.7 && t <= 40000 * 0.7, `turbo ${t}`)
    if (c <= 7000) short++
    if (c >= 26000) long++
  }
  assert.ok(short > n * 0.12 && short < n * 0.28, `sudden stops ${short}/${n}`)
  assert.ok(long > n * 0.12 && long < n * 0.28, `long plays ${long}/${n}`)
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
  const { chairMotion, MOVE_SPEED, insideBoard } = await import('../../src/core.js')
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
          assert.ok(insideBoard(p, arena), 'chair left the floor')
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
  const { chairsAtTime, MOVE_SPEED, insideBoard, boardSize } = await import('../../src/core.js')
  for (const [n, seed] of [[3, 11], [6, 202], [12, 3003], [30, 40404]]) {
    const r = buildRound(seed, 1, Array.from({ length: n }, (_, i) => 'p' + i), 'classic')
    const round = { ...r, level: 4, motion: 'wild', musicAt: 10_000, stopAt: 25_000 }
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
        assert.ok(insideBoard(p, r.arena), 'chair left the board')
        const b = seen[i]
        b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x)
        b.minY = Math.min(b.minY, p.y); b.maxY = Math.max(b.maxY, p.y)
      })
      prev = pts
    }
    assert.ok(fastest < MOVE_SPEED * 3.8, `n=${n}: chairs top out at ${fastest.toFixed(0)} u/s (players ${MOVE_SPEED}) — fast, but no teleporting`)
    assert.ok(longestRest < 0.4, `n=${n}: no chair rests longer than ${longestRest.toFixed(2)}s`)
    const { hx, hy } = boardSize(r.arena)
    for (const b of seen) {
      assert.ok(b.maxX - b.minX > hx * 0.7 && b.maxY - b.minY > hy * 0.7, `n=${n}: every chair roams across the board`)
    }
    // ...and right into the corners
    let corners = 0
    for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      let hit = false
      for (let f = 0; f < 60 * 40 && !hit; f += 6) {
        for (const p of chairsAtTime(round, 10_000 + (f * 1000) / 60)) {
          if (p.x * cx > hx * 0.7 && p.y * cy > hy * 0.65) { hit = true; break }
        }
      }
      if (hit) corners++
    }
    assert.equal(corners, 4, `n=${n}: chairs visit all four corners`)
    // the identical path no matter how you query it (cache-independent)
    const later = chairsAtTime({ ...round, seed: seed }, 33_333)
    assert.deepEqual(later, chairsAtTime(round, 33_333))
  }
})

test('game level sets the chair pace: low levels slow down at the stop, Insane speeds up, all catchable', async () => {
  const { chairsAtTime, MOVE_SPEED, SIT_DISTANCE, boardSize } = await import('../../src/core.js')
  for (const level of [1, 2, 3, 4, 5]) {
    for (const [n, seed] of [[2, 7], [3, 11], [12, 3003]]) {
      const r = buildRound(seed, 1, Array.from({ length: n }, (_, i) => 'p' + i), 'classic')
      const round = { ...r, level, motion: 'wild', musicAt: 0, stopAt: 15_000 }
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
      if (level <= 2) assert.ok(after < before * 0.8, `L${level} n=${n}: chairs slow down after the stop (${before.toFixed(0)} -> ${after.toFixed(0)} u/s)`)
      if (level === 5) assert.ok(after > before * 1.1, `L5 n=${n}: chairs speed up after the stop (${before.toFixed(0)} -> ${after.toFixed(0)} u/s)`)
      assert.ok(after > 40, `L${level} n=${n}: chairs still move after the stop (${after.toFixed(0)} u/s)`)
      // A chaser who aims a quarter-second ahead gets a chair within the scramble window.
      const { hx, hy } = boardSize(r.arena)
      let caught = 0
      for (let b = 0; b < 8; b++) {
        const me = { x: Math.cos(b) * hx * 0.6, y: Math.sin(b) * hy * 0.6 }
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
      assert.ok(caught >= 6, `L${level} n=${n}: ${caught}/8 chasers caught a chair`)
    }
  }
})

test('higher game levels: faster chairs and more obstacles; low levels keep the floor clear', async () => {
  const { chairsAtTime, roundHazards, HAZARDS, arenaFor, LEVELS } = await import('../../src/core.js')
  const speedFor = (level) => {
    const r = buildRound(99, 1, Array.from({ length: 6 }, (_, i) => 'p' + i), 'classic')
    const round = { ...r, level, motion: 'wild', musicAt: 0, stopAt: 10_000 }
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
  for (let l = 1; l < 5; l++) assert.ok(speedFor(l + 1) > speedFor(l), `level ${l + 1} chairs are faster than level ${l}`)
  assert.ok(speedFor(5) > speedFor(1) * 2, `Insane (${speedFor(5).toFixed(0)}) is much faster than Chill (${speedFor(1).toFixed(0)})`)
  for (let s = 0; s < 50; s++) {
    assert.deepEqual(roundHazards(s, 1), [], 'Chill: no obstacles')
    let prevN = 0
    for (const l of [2, 3, 4, 5]) {
      const h = roundHazards(s, l)
      assert.ok(h.every((x) => HAZARDS.includes(x)))
      assert.deepEqual(roundHazards(s, l), h, 'hazards are deterministic')
      assert.equal(h.length, LEVELS[l].hazards)
      assert.ok(h.length > prevN, 'more obstacles at each level')
      prevN = h.length
    }
    for (const l of [2, 3, 4]) for (const h of roundHazards(s, l)) assert.ok(!['fog', 'darkness', 'blackout', 'smoke', 'lasers', 'spin'].includes(h), `level ${l} only uses light obstacles`)
  }
  assert.ok(arenaFor(200, 20) - arenaFor(200, 5) > 300, 'floor grows with the crowd')
})

test('special chairs and bonus tiles: seeded, distinct, and combos beat singles', async () => {
  const { specialChairs, bonusTiles, chairBonus, tileAt, tileKind, boardSize, BOARD_X, BOARD_Y, CHAIR_BONUS, TILE_BONUS } = await import('../../src/core.js')
  for (const m of [1, 2, 3, 5, 12, 40]) {
    const { thrones, silvers } = specialChairs(123, m)
    assert.ok(thrones.length >= 1, `m=${m}: at least one throne`)
    assert.ok(thrones.length < Math.max(2, m), 'not every chair is a throne')
    assert.ok([...thrones, ...silvers].every((i) => i >= 0 && i < m))
    assert.equal(new Set([...thrones, ...silvers]).size, thrones.length + silvers.length, 'a chair is a throne or silver, not both')
    if (m >= 3) assert.ok(silvers.length >= 1, `m=${m}: silver chairs too`)
    assert.deepEqual(specialChairs(123, m), { thrones, silvers }, 'deterministic')
  }
  const t = bonusTiles(7)
  const key = ([i, j]) => i + ',' + j
  assert.equal(new Set([...t.gold, ...t.silver].map(key)).size, t.gold.length + t.silver.length, 'gold and silver tiles never overlap')
  assert.ok(t.gold.length > 0 && t.silver.length > t.gold.length)
  for (const [i, j] of [...t.gold, ...t.silver]) assert.ok(i >= 0 && i < BOARD_X && j >= 0 && j < BOARD_Y)
  assert.notDeepEqual(bonusTiles(8).gold, t.gold, 'new tiles every round')
  // a point in the middle of a gold tile is on it
  const arena = 900
  const { hx, hy, tile } = boardSize(arena)
  const [gi, gj] = t.gold[0]
  const p = { x: -hx + (gi + 0.5) * tile, y: -hy + (gj + 0.5) * tile }
  assert.deepEqual(tileAt(p, arena), [gi, gj])
  assert.equal(tileKind(p, { arena, ...t }), 'gold')
  // points ladder
  const pts = (c, tl) => chairBonus(c, tl).pts
  assert.equal(chairBonus('throne', 'gold').kind, 'jackpot')
  assert.ok(CHAIR_BONUS.silver < CHAIR_BONUS.throne && TILE_BONUS.silver < TILE_BONUS.gold, 'silver pays a bit less than gold')
  assert.ok(pts('throne', 'gold') > pts('throne', 'silver') && pts('throne', 'silver') > pts('silver', 'gold') && pts('silver', 'gold') > pts('silver', 'silver'))
  for (const c of ['throne', 'silver']) for (const tl of ['gold', 'silver']) assert.ok(pts(c, tl) > pts(c, null) + pts(null, tl), `${c} on ${tl} is a real combo`)
  assert.equal(pts(null, null), 0)
})
