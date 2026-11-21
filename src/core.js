// Shared, pure game rules — used by the host hub AND every client renderer.
//
// The dance itself is never streamed over the network. Each round the host
// publishes a seed, a conga order and a host-clock music start time; every
// browser then evaluates the same deterministic functions below, so 30 players
// glide around the chairs perfectly smoothly without a single position packet.
// Only after the music stops (when people steer themselves) do positions flow.

export const CHAIR_RADIUS = 26        // world units — a chair's sit zone
export const PLAYER_RADIUS = 20
export const SIT_DISTANCE = 30        // centre-to-centre distance that triggers a sit
export const MOVE_SPEED = 250         // world units / second while scrambling
export const ARENA_MARGIN = 230       // free floor beyond the outermost chair

export const THEMES = ['neon', 'cosmic', 'sunset']
export const MODES = ['classic', 'turbo']

// --- Seeded RNG ---------------------------------------------------------------
// mulberry32: tiny, fast and identical in every JS engine.
export function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle(arr, rand) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// --- Rules --------------------------------------------------------------------

// Classic: one chair fewer than players. Turbo: roughly a quarter of the field
// goes each round, so a 30-person team finishes in ~10 rounds instead of 29.
export function chairCount(alive, mode = 'classic') {
  if (alive <= 1) return 0
  const cut = mode === 'turbo' ? Math.max(1, Math.ceil(alive * 0.25)) : 1
  return Math.max(1, alive - cut)
}

// How long the music plays before it cuts out (ms). Random so nobody can
// count bars; turbo is snappier.
export function musicDuration(rand, mode = 'classic') {
  const [lo, hi] = mode === 'turbo' ? [8000, 17000] : [11000, 26000]
  return Math.round(lo + rand() * (hi - lo))
}

// --- Chair layouts --------------------------------------------------------------

export const LAYOUTS = ['ring', 'rows', 'star', 'sunflower', 'clusters', 'scatter']
export const LAYOUT_MODES = ['mix', 'random']
export const LAYOUT_NAMES = {
  ring: 'The Ring',
  rows: 'Back to Back',
  star: 'Starburst',
  sunflower: 'Sunflower',
  clusters: 'Islands',
  scatter: 'Random Scatter',
}

// Base (un-rotated) chair positions + facing angle for a layout.
export function chairLayout(type, m, seed = 1) {
  const chairs = []
  if (m <= 0) return chairs
  const spacing = 74
  if (type === 'scatter') return scatterLayout(m, seed)
  if (type === 'rows') {
    // Classic party layout: two rows back to back, facing outward.
    const perRow = Math.ceil(m / 2)
    for (let i = 0; i < m; i++) {
      const row = i < perRow ? 0 : 1
      const idx = row === 0 ? i : i - perRow
      const count = row === 0 ? perRow : m - perRow
      const y = (idx - (count - 1) / 2) * spacing
      const x = row === 0 ? -24 : 24
      chairs.push({ x, y, face: row === 0 ? Math.PI : 0 })
    }
    return chairs
  }
  if (type === 'sunflower') {
    // Phyllotaxis (golden-angle spiral) — looks like a sunflower head.
    const golden = Math.PI * (3 - Math.sqrt(5))
    for (let i = 0; i < m; i++) {
      const r = 46 * Math.sqrt(i + 0.6)
      const a = i * golden
      chairs.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, face: a })
    }
    return chairs
  }
  if (type === 'star') {
    // Ring with alternating radii: a spiky star.
    const base = Math.max(110, (m * spacing) / (2 * Math.PI))
    for (let i = 0; i < m; i++) {
      const a = (i / m) * Math.PI * 2 - Math.PI / 2
      const r = m > 3 && i % 2 ? base * 0.62 : base
      chairs.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, face: a })
    }
    return chairs
  }
  if (type === 'clusters') {
    // Little islands of up to 3 chairs spread around a circle.
    const groups = Math.max(1, Math.ceil(m / 3))
    const R = groups === 1 ? 0 : Math.max(130, (groups * 190) / (2 * Math.PI))
    let i = 0
    for (let g = 0; g < groups; g++) {
      const ga = (g / groups) * Math.PI * 2 - Math.PI / 2
      const cx = Math.cos(ga) * R
      const cy = Math.sin(ga) * R
      const inGroup = Math.min(3, m - i)
      for (let k = 0; k < inGroup; k++, i++) {
        const la = (k / inGroup) * Math.PI * 2 + ga
        const lr = inGroup === 1 ? 0 : 40
        chairs.push({ x: cx + Math.cos(la) * lr, y: cy + Math.sin(la) * lr, face: la })
      }
    }
    return chairs
  }
  // ring (default)
  const R = m === 1 ? 0 : Math.max(95, (m * spacing) / (2 * Math.PI))
  for (let i = 0; i < m; i++) {
    const a = (i / m) * Math.PI * 2 - Math.PI / 2
    chairs.push({ x: Math.cos(a) * R, y: Math.sin(a) * R, face: a })
  }
  return chairs
}

// Chairs dropped at random spots anywhere on the floor (seeded, so every
// screen gets the same arrangement). Rejection sampling keeps a walkable gap
// between chairs; if the floor gets too crowded it grows a little and retries.
function scatterLayout(m, seed) {
  const rand = rng((seed ^ 0x5ca77e2) >>> 0)
  const minGap = CHAIR_RADIUS * 2.7
  let R = Math.max(150, Math.sqrt(m) * 68)
  for (;;) {
    const chairs = []
    let tries = 0
    while (chairs.length < m && tries < m * 400) {
      tries++
      // sqrt for an even spread over the disc, not bunched in the middle
      const r = Math.sqrt(rand()) * R
      const a = rand() * Math.PI * 2
      const x = Math.cos(a) * r
      const y = Math.sin(a) * r
      if (chairs.every((c) => Math.hypot(c.x - x, c.y - y) >= minGap)) {
        chairs.push({ x, y, face: rand() * Math.PI * 2 })
      }
    }
    if (chairs.length === m) return chairs
    R *= 1.08
  }
}

export function layoutRadius(chairs) {
  let r = 0
  for (const c of chairs) r = Math.max(r, Math.hypot(c.x, c.y))
  return r + CHAIR_RADIUS
}

// Chairs slowly rotate while the music plays (some layouts spin the other way)
// and freeze the instant it stops.
export function chairSpin(type) {
  return { ring: 0.16, rows: 0.09, star: -0.2, sunflower: 0.12, clusters: -0.14, scatter: 0.07 }[type] ?? 0.1
}

// --- Moving chairs during the scramble ----------------------------------------
// After the music stops the chairs keep wandering so you have to chase one.
// Pure function of seconds-since-stop: every screen (and the host's referee)
// agrees where each chair is at any moment. Motion starts from zero at the
// stop instant, so nothing jumps.

export const MOTIONS = ['still', 'drift', 'wild']
export const MOTION_TUNING = {
  still: { rot: 0, amp: 0, freq: 0 },
  drift: { rot: 0.16, amp: 38, freq: 0.9, edge: 40 },
  wild: { rot: 0.3, amp: 52, freq: 1.1, edge: 64 },
}

export function chairMotion(base, i, s, motion = 'still', arena = Infinity) {
  const m = MOTION_TUNING[motion] || MOTION_TUNING.still
  if (!m.amp || s <= 0) return base
  // formation keeps turning (alternate rounds spin the other way via index parity)
  // Cap the spin so outer chairs on a huge floor never outrun a player.
  const R = Number.isFinite(arena) ? Math.max(60, arena - ARENA_MARGIN) : 200
  const a = Math.min(m.rot, m.edge / R) * s
  const c = Math.cos(a)
  const sn = Math.sin(a)
  let x = base.x * c - base.y * sn
  let y = base.x * sn + base.y * c
  // each chair also loops on its own little Lissajous figure
  const p1 = i * 2.399
  const p2 = i * 1.731 + 1
  const f1 = m.freq * (1 + (i % 3) * 0.17)
  const f2 = m.freq * (1.3 + (i % 4) * 0.11)
  x += m.amp * (Math.sin(f1 * s + p1) - Math.sin(p1))
  y += m.amp * (Math.sin(f2 * s + p2) - Math.sin(p2))
  const d = Math.hypot(x, y)
  const lim = arena - CHAIR_RADIUS * 1.5
  if (d > lim) { x = (x / d) * lim; y = (y / d) * lim }
  return { x, y, face: base.face + a + 0.4 * Math.sin(f1 * s + p2) }
}

export function chairsAt(round, tau) {
  const spin = chairSpin(round.layout) * Math.max(0, tau)
  const c = Math.cos(spin)
  const s = Math.sin(spin)
  return round.chairs.map((ch) => ({
    x: ch.x * c - ch.y * s,
    y: ch.x * s + ch.y * c,
    face: ch.face + spin,
  }))
}

// --- Dance patterns -----------------------------------------------------------
// Each pattern maps (player slot k of n, time tau seconds, base radius R) to a
// point. "Conga" patterns put everybody on one closed curve, evenly spaced, so
// it reads like a real line of people dancing round the chairs.

export const PATTERNS = ['orbit', 'flower', 'eight', 'breathe', 'twin', 'star', 'wave']
export const PATTERN_NAMES = {
  orbit: 'Conga Orbit',
  flower: 'Flower Power',
  eight: 'Figure Eight',
  breathe: 'Breathing Spiral',
  twin: 'Twin Rings',
  star: 'Star Trail',
  wave: 'Snake Wave',
}

const TAU = Math.PI * 2
const WALK = 140 // approx. walking speed along a conga curve, units/s

function polar(r, a) {
  return { x: Math.cos(a) * r, y: Math.sin(a) * r }
}

// Point on a closed curve parameterised by u in [0,1).
function curve(name, u, R) {
  const a = u * TAU
  switch (name) {
    case 'orbit':
      return polar(R + 70, a)
    case 'flower': {
      // 5-petal rose that dips inside the chair ring and back out.
      const r = R + 30 + 95 * Math.cos(5 * a)
      return polar(Math.max(35, r), a)
    }
    case 'eight': {
      // Lemniscate of Bernoulli spanning the whole floor.
      const s = (R + 150) * 1.05
      const d = 1 + Math.sin(a) ** 2
      return { x: (s * Math.cos(a)) / d, y: (s * Math.sin(a) * Math.cos(a)) / d }
    }
    case 'star': {
      // 5-point star: straight legs alternating outer and inner vertices.
      const pts = 10
      const f = u * pts
      const i = Math.floor(f)
      const t = f - i
      const v = (j) => polar(j % 2 ? Math.max(40, R - 30) : R + 160, (j / pts) * TAU - Math.PI / 2)
      const p0 = v(i)
      const p1 = v(i + 1)
      return { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t }
    }
    case 'wave':
    default: {
      const r = R + 85 + 45 * Math.sin(7 * a)
      return polar(r, a)
    }
  }
}

function perimeter(name, R) {
  // Rough lengths — only used to keep walking speed believable.
  switch (name) {
    case 'orbit': return TAU * (R + 70)
    case 'flower': return TAU * (R + 30) * 2.6
    case 'eight': return (R + 150) * 5.3
    case 'star': return 10 * Math.hypot(R + 160 - (R - 30) * 0.81, (R - 30) * 0.59) + 1
    default: return TAU * (R + 85) * 1.35
  }
}

export function patternPos(name, k, n, tau, R, dir = 1) {
  if (name === 'breathe') {
    // Everyone on their own spoke, swelling in and out like breathing.
    const a = (k / n) * TAU + dir * 0.45 * tau
    const r = R + 40 + 150 * (0.5 + 0.5 * Math.sin(1.4 * tau + (k / n) * TAU * 2))
    return polar(r, a)
  }
  if (name === 'twin') {
    // Two counter-rotating rings: evens outside, odds inside the chairs.
    const outer = k % 2 === 0
    const ringN = outer ? Math.ceil(n / 2) : Math.floor(n / 2)
    const j = Math.floor(k / 2)
    const r = outer ? R + 115 : Math.max(32, R - 70)
    const w = (WALK / Math.max(r, 60)) * (outer ? dir : -dir)
    return polar(r, (j / Math.max(1, ringN)) * TAU + w * tau)
  }
  const per = perimeter(name, R)
  const u = (((k / n + (dir * WALK * tau) / per) % 1) + 1) % 1
  return curve(name, u, R)
}

// A round's choreography: a list of [pattern, durationSeconds, direction]
// segments, cross-faded so the line morphs from one shape into the next.
export function choreography(seed) {
  const rand = rng(seed ^ 0x9e3779b9)
  const order = shuffle(PATTERNS, rand)
  const segs = []
  let total = 0
  let i = 0
  while (total < 120) {
    const dur = 6 + Math.floor(rand() * 5)
    segs.push({ p: order[i % order.length], dur, dir: rand() < 0.5 ? -1 : 1 })
    total += dur
    i++
  }
  return segs
}

const BLEND = 1.4

function smooth(t) {
  return t * t * (3 - 2 * t)
}

export function dancePos(segs, k, n, tau, R) {
  if (tau <= 0) return patternPos(segs[0].p, k, n, 0, R, segs[0].dir)
  let start = 0
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    const end = start + s.dur
    if (tau < end || i === segs.length - 1) {
      const p = patternPos(s.p, k, n, tau, R, s.dir)
      const into = tau - start
      if (i > 0 && into < BLEND) {
        const prev = segs[i - 1]
        const q = patternPos(prev.p, k, n, tau, R, prev.dir)
        const t = smooth(into / BLEND)
        return { x: q.x + (p.x - q.x) * t, y: q.y + (p.y - q.y) * t }
      }
      return p
    }
    start = end
  }
  return { x: 0, y: 0 }
}

export function segmentAt(segs, tau) {
  let start = 0
  for (const s of segs) {
    if (tau < start + s.dur) return s
    start += s.dur
  }
  return segs[segs.length - 1]
}

// --- Round construction ------------------------------------------------------

// Everything a client needs to render a round, derived from (seed, alive ids).
export function pickLayout(rand, roundNo, m, layoutMode = 'mix') {
  if (layoutMode === 'random') return 'scatter'
  // Cycle so consecutive rounds look different; tiny games keep a ring.
  const layout = LAYOUTS[(Math.floor(rand() * LAYOUTS.length) + roundNo) % LAYOUTS.length]
  return m <= 2 ? 'ring' : layout
}

export function buildRound(seed, roundNo, aliveIds, mode, layoutMode = 'mix') {
  const rand = rng(seed)
  const m = chairCount(aliveIds.length, mode)
  const layout = pickLayout(rand, roundNo, m, layoutMode)
  const chairs = chairLayout(layout, m, seed)
  const R = layoutRadius(chairs)
  return {
    no: roundNo,
    seed,
    layout,
    chairs,
    R,
    arena: R + ARENA_MARGIN,
    order: shuffle(aliveIds, rand),
    segs: choreography(seed),
    musicMs: musicDuration(rand, mode),
    track: Math.floor(rand() * 1000),
  }
}

export function clampToArena(p, arena) {
  const d = Math.hypot(p.x, p.y)
  if (d <= arena) return p
  return { x: (p.x / d) * arena, y: (p.y / d) * arena }
}

export function nearestFreeChair(chairPts, owners, p) {
  let best = -1
  let bd = Infinity
  chairPts.forEach((c, i) => {
    if (owners[i]) return
    const d = Math.hypot(c.x - p.x, c.y - p.y)
    if (d < bd) { bd = d; best = i }
  })
  return { index: best, dist: bd }
}

export const PLAYER_COLORS = [
  '#ff3cac', '#00e5ff', '#ffe600', '#7cff4f', '#ff8a00', '#b26bff',
  '#ff4f6d', '#2bffc6', '#4f8bff', '#ffd1f4', '#c6ff00', '#ff6ef2',
]
