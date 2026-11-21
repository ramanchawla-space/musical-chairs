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
