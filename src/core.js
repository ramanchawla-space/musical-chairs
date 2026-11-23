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
export const MOVE_SPEED = 300         // world units / second while scrambling
export const ARENA_MARGIN = 360       // free floor beyond the outermost chair

export const THEMES = ['neon', 'cosmic', 'sunset']
export const TRACK_COUNT = 9 // tracks in the round rotation (audio.js TRACKS)
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

// --- Points ------------------------------------------------------------------
// Sitting scores 100, plus up to 250 for speed (it drains over ~4s after the
// stop), plus 100 for being first down. Special chairs and tiles pay extra
// (see below). Surviving round after round adds a streak bonus; out players score
// by calling who goes next; the last one standing in each level gets a bonus.
// Points carry across all five levels: the most points wins the game.
export const POINTS = {
  sit: 100, speed: 250, speedDrain: 60, first: 100, streak: 25, predict: 200,
  levelWin: 300,
}

export function sitPoints(secs, order) {
  const speed = Math.max(0, Math.round(POINTS.speed - POINTS.speedDrain * Math.max(0, secs)))
  return POINTS.sit + speed + (order === 0 ? POINTS.first : 0)
}

// Bonus for surviving `streak` rounds in a row (the first survival earns none).
export function streakBonus(streak) {
  return POINTS.streak * Math.max(0, streak - 1)
}

// --- Special chairs and bonus tiles ----------------------------------------------
// Every round a few chairs are golden THRONES and a few more are SILVER chairs.
// Some of the board's squares are GOLD TILES and some SILVER TILES: grab a
// chair while it is on one for extra points. A special chair on a special tile
// pays a combo, topped by the JACKPOT: a throne on a gold tile. Everything is
// seeded from the round, so every screen and the host agree.
export const CHAIR_BONUS = { throne: 300, silver: 150 }
export const TILE_BONUS = { gold: 150, silver: 75 }
// chair -> tile -> combo points (replaces the two separate bonuses)
export const COMBO_BONUS = {
  throne: { gold: 1000, silver: 600 },
  silver: { gold: 450, silver: 300 },
}
export const BONUS_KINDS = {
  jackpot: { chair: 'throne', tile: 'gold' },
  royal: { chair: 'throne', tile: 'silver' },
  golden: { chair: 'silver', tile: 'gold' },
  sterling: { chair: 'silver', tile: 'silver' },
  throne: { chair: 'throne', tile: null },
  silver: { chair: 'silver', tile: null },
  gold: { chair: null, tile: 'gold' },
  silvertile: { chair: null, tile: 'silver' },
}

export function specialChairs(seed, m) {
  if (m <= 0) return { thrones: [], silvers: [] }
  const rand = rng((seed ^ 0x7e7203e) >>> 0)
  const order = shuffle([...Array(m).keys()], rand)
  const nT = m <= 2 ? 1 : Math.max(1, Math.round(m / 6))
  const nS = m <= 2 ? 0 : Math.max(1, Math.round(m / 4))
  const sort = (a) => a.sort((x, y) => x - y)
  return { thrones: sort(order.slice(0, nT)), silvers: sort(order.slice(nT, Math.min(m, nT + nS))) }
}
export function throneChairs(seed, m) {
  return specialChairs(seed, m).thrones
}

export const GOLD_TILE_COUNT = 8
export const SILVER_TILE_COUNT = 12
// [col, row] squares of the BOARD_X x BOARD_Y board. The middle squares
// (where the round table goes) are never special.
export function bonusTiles(seed) {
  const rand = rng((seed ^ 0x601d) >>> 0)
  const all = []
  for (let j = 0; j < BOARD_Y; j++) {
    for (let i = 0; i < BOARD_X; i++) {
      const mid = i >= BOARD_X / 2 - 2 && i < BOARD_X / 2 + 2 && j >= BOARD_Y / 2 - 2 && j < BOARD_Y / 2 + 2
      if (!mid) all.push([i, j])
    }
  }
  const mixed = shuffle(all, rand)
  return { gold: mixed.slice(0, GOLD_TILE_COUNT), silver: mixed.slice(GOLD_TILE_COUNT, GOLD_TILE_COUNT + SILVER_TILE_COUNT) }
}
export function goldTiles(seed) {
  return bonusTiles(seed).gold
}

// Which board square a point is on.
export function tileAt(p, arena) {
  const { hx, hy, tile } = boardSize(arena)
  const i = Math.floor((p.x + hx) / tile)
  const j = Math.floor((p.y + hy) / tile)
  return i >= 0 && i < BOARD_X && j >= 0 && j < BOARD_Y ? [i, j] : null
}

const hasTile = (tiles, t) => !!t && !!tiles?.some(([i, j]) => i === t[0] && j === t[1])
export function onGoldTile(p, arena, tiles) {
  return hasTile(tiles, tileAt(p, arena))
}

// 'gold' | 'silver' | null: the bonus tile under a point this round.
export function tileKind(p, round) {
  const t = tileAt(p, round.arena)
  if (hasTile(round.gold, t)) return 'gold'
  if (hasTile(round.silver, t)) return 'silver'
  return null
}

// 'throne' | 'silver' | null
export function chairKind(round, i) {
  if (round.thrones?.includes(i)) return 'throne'
  if (round.silvers?.includes(i)) return 'silver'
  return null
}

// The bonus for grabbing a `chair`-kind chair on a `tile`-kind square.
export function chairBonus(chair, tile) {
  if (chair === true) chair = 'throne' // (throne, onGold) shorthand
  if (tile === true) tile = 'gold'
  if (chair === false) chair = null
  if (tile === false) tile = null
  const kind = Object.keys(BONUS_KINDS).find((k) => BONUS_KINDS[k].chair === (chair || null) && BONUS_KINDS[k].tile === (tile || null)) || null
  const pts = chair && tile ? COMBO_BONUS[chair][tile] : chair ? CHAIR_BONUS[chair] : tile ? TILE_BONUS[tile] : 0
  return { kind, pts }
}

// Classic: one chair fewer than players. Turbo: roughly a quarter of the field
// goes each round, so a 30-person team finishes a level in ~10 rounds.
export function chairCount(alive, mode = 'classic') {
  if (alive <= 1) return 0
  const cut = mode === 'turbo' ? Math.max(1, Math.ceil(alive * 0.25)) : 1
  return Math.max(1, alive - cut)
}

// How long the music plays before it cuts out (ms). Deliberately
// unpredictable: about one round in five is a sudden stop after a few
// seconds, one in five is a long one, the rest are in between. Turbo is
// snappier.
export const MUSIC_LENGTHS = {
  short: [3500, 7000],
  normal: [9000, 22000],
  long: [26000, 40000],
}
export function musicDuration(rand, mode = 'classic') {
  const roll = rand()
  const kind = roll < 0.2 ? 'short' : roll < 0.8 ? 'normal' : 'long'
  const [lo, hi] = MUSIC_LENGTHS[kind]
  const ms = lo + rand() * (hi - lo)
  return Math.round(mode === 'turbo' ? ms * 0.7 : ms)
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
  const spacing = 96
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
      const r = 60 * Math.sqrt(i + 0.6)
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
    const R = groups === 1 ? 0 : Math.max(150, (groups * 240) / (2 * Math.PI))
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
  let R = Math.max(180, Math.sqrt(m) * 92)
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

// The floor grows with the crowd so 20+ dancers never feel crammed.
export const ARENA_PER_PLAYER = 22
export function arenaFor(R, players) {
  return R + ARENA_MARGIN + ARENA_PER_PLAYER * Math.max(0, players)
}

// The floor is a big rectangular checkerboard, BOARD_X x BOARD_Y squares.
// `arena` stays the single size number every round carries; the board's
// half-width and half-depth come from it, so the tiles are always square.
export const BOARD_X = 12
export const BOARD_Y = 10
export function boardSize(arena) {
  const hx = arena * 0.95
  return { hx, hy: (hx * BOARD_Y) / BOARD_X, tile: (2 * hx) / BOARD_X }
}

export function insideBoard(p, arena, margin = 0) {
  const { hx, hy } = boardSize(arena)
  return Math.abs(p.x) <= hx - margin + 1e-6 && Math.abs(p.y) <= hy - margin + 1e-6
}

function clampBox(x, y, lx, ly) {
  return { x: Math.max(-lx, Math.min(lx, x)), y: Math.max(-ly, Math.min(ly, y)) }
}

// --- Levels ---------------------------------------------------------------------
// A game is five levels played back to back. Each level runs until one player
// is left; then EVERYONE comes back in for the next, harder level. Higher
// levels make the chairs quicker, give less time to sit and bring in more
// obstacles (only once the music stops, so the dance stays clear). `stop` is
// the chairs' speed after the stop, relative to the dance.
export const LEVELS = {
  1: { name: 'Chill', blurb: 'slow chairs, clear floor', speed: 0.6, stop: 0.45, hazards: 0, blink: 0, time: 1 },
  2: { name: 'Easy', blurb: 'quicker chairs + 1 obstacle', speed: 0.72, stop: 0.6, hazards: 1, blink: 0, time: 0.9 },
  3: { name: 'Medium', blurb: 'faster + 2 obstacles', speed: 0.85, stop: 0.8, hazards: 2, blink: 0.25, time: 0.8 },
  4: { name: 'Hard', blurb: 'fast + 3 obstacles', speed: 1, stop: 1.05, hazards: 3, blink: 0.5, time: 0.72 },
  5: { name: 'Insane', blurb: 'chairs fly + 4 obstacles', speed: 1.15, stop: 1.3, hazards: 4, blink: 0.8, time: 0.65 },
}
export const LEVEL_IDS = [1, 2, 3, 4, 5]
export const TOTAL_LEVELS = LEVEL_IDS.length
export const DEFAULT_LEVEL = 1

export function levelOf(round) {
  return LEVELS[round?.level] || LEVELS[DEFAULT_LEVEL]
}

// How long players get to sit once the music stops: less time on higher levels.
export function scrambleWindow(round, maxMs) {
  return Math.round(maxMs * levelOf(round).time)
}

// 0 (Chill) .. 1 (Insane): how intense the obstacles are.
export function roundLevel(round) {
  const id = LEVELS[round?.level] ? round.level : DEFAULT_LEVEL
  return (id - 1) / 4
}

export const HAZARDS = ['fog', 'birds', 'blackout', 'mirage', 'balls', 'bouncers', 'balloons', 'lasers', 'smoke', 'darkness', 'spin', 'confetti']
export const HAZARD_NAMES = {
  fog: 'Fog', birds: 'Birds', blackout: 'Blackouts', mirage: 'Mirage chairs', balls: 'Giant disco balls',
  bouncers: 'Bouncers', balloons: 'Balloons', lasers: 'Laser walls', smoke: 'Smoke cannons',
  darkness: 'Lights out', spin: 'Spinning floor', confetti: 'Confetti storm',
}

// Obstacles that leave the floor mostly visible. The ones that hide a lot of
// the floor (fog, blackouts, smoke, lights out, spinning) only join on level 5.
const LIGHT_HAZARDS = ['birds', 'balloons', 'balls', 'bouncers', 'mirage', 'confetti']

// Which hazards hit this round: none on level 1, one more each level after. Seeded, so every screen (and the host) agrees.
export function roundHazards(seed, level = DEFAULT_LEVEL) {
  const L = LEVELS[level] || LEVELS[DEFAULT_LEVEL]
  if (!L.hazards) return []
  const rand = rng((seed ^ 0x4a2a4a2a) >>> 0)
  const pool = level >= 5 ? HAZARDS : LIGHT_HAZARDS
  return shuffle(pool, rand).slice(0, Math.min(pool.length, L.hazards))
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
export const ROAM_SPEED = 230 // average chair cruise speed in Wild mode (players run at MOVE_SPEED)
const JITTER_AMP = 10 // sideways zig-zag on top of the roaming path
const JITTER_FREQ = 1.4
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
  if (Number.isFinite(arena)) {
    const { hx, hy } = boardSize(arena)
    ;({ x, y } = clampBox(x, y, hx - CHAIR_RADIUS * 1.5, hy - CHAIR_RADIUS * 1.5))
  }
  return { x, y, face: base.face + a + 0.4 * Math.sin(f1 * s + p2) }
}

// --- Wild mode: chairs roam the whole floor -----------------------------------
// From the moment the music starts, every chair darts between random waypoints
// anywhere on the floor (pausing, sweeping, doubling back), and never stops —
// so there's no spot you can pre-aim at. Waypoints come from a per-chair seeded
// RNG generated strictly in order, so every browser and the host's referee get
// the identical path no matter when or how often they ask.

const roamCache = new Map()

// Does the straight leg last -> (x, y) keep clear of a disc of radius `avoid`
// round the middle? A leg that starts inside the disc may only head outward.
function clearOfMiddle(last, x, y, avoid) {
  if (!avoid) return true
  const dx = x - last.x
  const dy = y - last.y
  if (Math.hypot(x, y) < avoid * 1.15) return false
  const away = last.x * dx + last.y * dy
  if (Math.hypot(last.x, last.y) < avoid) return away >= 0
  const L2 = dx * dx + dy * dy || 1
  const u = Math.max(0, Math.min(1, -away / L2))
  return Math.hypot(last.x + dx * u, last.y + dy * u) >= avoid * 1.1
}

function roamPath(seed, i, base, arena, speed, avoid) {
  const key = seed + ':' + i + ':' + Math.round(arena) + ':' + Math.round(speed) + ':' + Math.round(avoid)
  let path = roamCache.get(key)
  if (!path) {
    if (roamCache.size > 4000) roamCache.clear()
    path = { pts: [{ x: base.x, y: base.y, t: 0 }], rand: rng((Math.imul(seed, 31) + Math.imul(i + 1, 7919)) >>> 0) }
    roamCache.set(key, path)
  }
  return path
}

// `avoid`: a radius round the middle that legs between waypoints never cut
// through (the round table lives there once people start sitting).
export function roamPos(seed, i, base, t, arena, speed = ROAM_SPEED, jitter = 1, avoid = 0) {
  const path = roamPath(seed, i, base, arena, speed, avoid)
  const pts = path.pts
  const { hx, hy } = boardSize(arena)
  const lx = Math.max(40, hx - CHAIR_RADIUS * 2)
  const ly = Math.max(40, hy - CHAIR_RADIUS * 2)
  const lim = ly
  // Always keep two waypoints beyond t (needed for the spline's tangent).
  while (pts.length < 3 || pts[pts.length - 2].t <= t) {
    const last = pts[pts.length - 1]
    let x
    let y
    let d
    // Next spot: random anywhere on the board. Mostly long dashes, with
    // sudden short darts thrown in so a chair can jink sideways or double back.
    const dart = path.rand() < 0.35
    // Half the long trips head for a corner or the far edges of the board.
    const edge = !dart && path.rand() < 0.6
    const corner = edge && path.rand() < 0.7
    let tries = 0
    do {
      const sx = path.rand() < 0.5 ? -1 : 1
      const sy = path.rand() < 0.5 ? -1 : 1
      const u = path.rand()
      const v = path.rand()
      if (corner) {
        x = sx * lx * (0.8 + 0.2 * u)
        y = sy * ly * (0.75 + 0.25 * v)
      } else if (edge) {
        // a spot along one of the four sides
        if (path.rand() < 0.5) { x = sx * lx * (0.85 + 0.15 * u); y = (v * 2 - 1) * ly }
        else { x = (u * 2 - 1) * lx; y = sy * ly * (0.85 + 0.15 * v) }
      } else {
        x = (u * 2 - 1) * lx
        y = (v * 2 - 1) * ly
      }
      d = Math.hypot(x - last.x, y - last.y)
      tries++
    } while (tries < 400 && ((dart ? d < lim * 0.22 || d > lim * 0.6 : d < lim * 0.5) || !clearOfMiddle(last, x, y, avoid)))
    const dur = (d / speed) * (0.9 + path.rand() * 0.4)
    pts.push({ x, y, t: last.t + dur })
  }
  let lo = 0
  let hi = pts.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (pts[mid].t <= t) lo = mid
    else hi = mid
  }
  // Cubic Hermite through the waypoints with time-based tangents: the chair
  // flows through every point without ever stopping.
  const p0 = pts[lo]
  const p1 = pts[lo + 1]
  const pm = pts[lo - 1] || p0
  const p2 = pts[lo + 2] || p1
  const h = p1.t - p0.t
  const tan = (a, b) => {
    if (b.t <= a.t) return { x: 0, y: 0 }
    const vx = (b.x - a.x) / (b.t - a.t)
    const vy = (b.y - a.y) / (b.t - a.t)
    // cap the tangent so the spline never whips through a waypoint
    const k = Math.min(1, (speed * 1.1) / (Math.hypot(vx, vy) || 1))
    return { x: vx * k, y: vy * k }
  }
  const m0 = lo === 0 ? tan(p0, p1) : tan(pm, p1)
  const m1 = tan(p0, p2)
  const u = Math.min(1, Math.max(0, (t - p0.t) / h))
  const u2 = u * u
  const u3 = u2 * u
  const h00 = 2 * u3 - 3 * u2 + 1
  const h10 = u3 - 2 * u2 + u
  const h01 = -2 * u3 + 3 * u2
  const h11 = u3 - u2
  let x = h00 * p0.x + h10 * h * m0.x + h01 * p1.x + h11 * h * m1.x
  let y = h00 * p0.y + h10 * h * m0.y + h01 * p1.y + h11 * h * m1.y
  // Twitchy zig-zag on top (starts at zero so the round opens in its shape).
  const jf = JITTER_FREQ * (1 + (i % 5) * 0.09)
  x += jitter * JITTER_AMP * (Math.sin(jf * t * 6.283 + i) - Math.sin(i))
  y += jitter * JITTER_AMP * (Math.cos(jf * 1.37 * t * 6.283 + i * 2) - Math.cos(i * 2))
  ;({ x, y } = clampBox(x, y, lx, ly))
  return { x, y, face: base.face + t * 0.9 + Math.sin(t * 2 + i) * 0.5 }
}

// Wild chairs blink out of sight now and then (purely visual, but the same
// on every screen). Returns 0 (invisible) .. 1 (fully visible).
export function chairVisibility(seed, i, t, lv = 0) {
  const period = (2.6 + ((Math.imul(seed ^ (i * 2654435761), 1597334677) >>> 0) % 1000) / 1000 * 1.6) * (1 - 0.25 * lv)
  const cyc = Math.floor(t / period)
  const h = (Math.imul((seed + cyc * 7919) ^ (i * 40503), 2246822519) >>> 0) / 4294967296
  const start = 0.15 + h * 0.55 // when, within this cycle, it vanishes
  const off = (0.55 + h * 0.35) * (1 + 0.6 * lv) // and for how long (s)
  const u = t - cyc * period - start * period
  if (u < 0 || u > off) return 1
  const edge = 0.12
  return u < edge ? 1 - u / edge : u > off - edge ? (u - (off - edge)) / edge : 0
}

// --- The round table -----------------------------------------------------------
// Once somebody sits on a chair it stops roaming: chair and sitter glide to
// a seat around a round table in the middle of the board and stay put. The
// free chairs keep roaming but are kept out of the table area. The host
// records [claimTime, seatSlot] per chair in round.seats; everything else is
// a pure function of that, so every screen agrees.
export const SEAT_GLIDE_MS = 1200

export function roundTable(round) {
  const m = Math.max(1, round.chairs.length)
  const ring = Math.max(110, (m * 92) / (2 * Math.PI)) // where the seats sit
  return { ring, top: ring - 56, keepOut: ring + CHAIR_RADIUS * 2.6 }
}

export function seatSlot(round, slot) {
  const m = Math.max(1, round.chairs.length)
  const { ring } = roundTable(round)
  const a = -Math.PI / 2 + (slot / m) * Math.PI * 2
  // the chair's backrest is on its local -x side, so face = angle + PI looks at the table
  return { x: Math.cos(a) * ring, y: Math.sin(a) * ring, face: a + Math.PI }
}

const smoothstep = (u) => u * u * (3 - 2 * u)

// Where chair i is at host time hostT, for any motion setting. Used by every
// client to draw and by the host to referee claims.
export function chairPosAt(round, i, hostT) {
  const seat = round.seats?.[i]
  if (seat && hostT >= seat[0]) {
    // Taken: glide from where it was caught to its seat at the table, then stay.
    const from = freeChairPos(round, i, seat[0])
    const to = seatSlot(round, seat[1])
    const u = smoothstep(Math.min(1, (hostT - seat[0]) / SEAT_GLIDE_MS))
    let df = (to.face - from.face) % (Math.PI * 2)
    if (df > Math.PI) df -= Math.PI * 2
    if (df < -Math.PI) df += Math.PI * 2
    return { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u, face: from.face + df * u }
  }
  return freeChairPos(round, i, hostT)
}

// Free chairs: their roaming path, nudged out of the table area once the
// music stops (the keep-out zone grows in smoothly, so nothing jumps).
function freeChairPos(round, i, hostT) {
  const p = roamingChairPos(round, i, hostT)
  if (!round.stopAt || hostT <= round.stopAt) return p
  const k = Math.min(1, (hostT - round.stopAt) / 1500)
  const R = roundTable(round).keepOut * k
  const d = Math.hypot(p.x, p.y)
  if (d >= R) return p
  const a = d > 1e-6 ? Math.atan2(p.y, p.x) : i * 2.399
  return { x: Math.cos(a) * R, y: Math.sin(a) * R, face: p.face }
}

function roamingChairPos(round, i, hostT) {
  const base = round.chairs[i]
  const sinceMusic = Math.max(0, (hostT - round.musicAt) / 1000)
  const L = levelOf(round)
  if (round.motion === 'wild') {
    // Once the music stops the path clock runs slower (or faster on the top
    // levels): same path, no jump, just a different pace.
    const sinceStop = round.stopAt ? Math.max(0, (hostT - round.stopAt) / 1000) : 0
    const lv = roundLevel(round)
    return roamPos(round.seed, i, base, sinceMusic + (L.stop - 1) * sinceStop, round.arena, ROAM_SPEED * L.speed, 0.6 + 0.8 * lv, roundTable(round).keepOut)
  }
  const stopTau = round.stopAt ? Math.max(0, (round.stopAt - round.musicAt) / 1000) : Infinity
  const spin = chairSpin(round.layout) * Math.min(sinceMusic, stopTau)
  const c = Math.cos(spin)
  const s = Math.sin(spin)
  const spun = { x: base.x * c - base.y * s, y: base.x * s + base.y * c, face: base.face + spin }
  if (round.stopAt && hostT > round.stopAt) return chairMotion(spun, i, ((hostT - round.stopAt) / 1000) * L.stop, round.motion, round.arena)
  return spun
}

// Bouncers: big lads who wander the floor and physically block you.
export const BOUNCER_RADIUS = 34
export function bouncers(round, hostT) {
  const n = 1 + Math.round(roundLevel(round) * 3) + Math.floor(round.order?.length / 10 || 0)
  const seed = (round.seed ^ 0xb0b) >>> 0
  const since = Math.max(0, (hostT - round.musicAt) / 1000)
  const out = []
  const { hx, hy } = boardSize(round.arena)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.4
    const base = { x: Math.cos(a) * hx * 0.5, y: Math.sin(a) * hy * 0.5, face: 0 }
    out.push(roamPos(seed, i, base, since, round.arena, 120, 0))
  }
  return out
}

export function chairsAtTime(round, hostT) {
  return round.chairs.map((_, i) => chairPosAt(round, i, hostT))
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

export function buildRound(seed, roundNo, aliveIds, mode, layoutMode = 'mix', start) {
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
    arena: arenaFor(R, aliveIds.length),
    start,
    order: shuffle(aliveIds, rand),
    segs: choreography(seed),
    musicMs: musicDuration(rand, mode),
    track: Math.floor(rand() * 1000),
  }
}

// Keep a player on the checkerboard.
export function clampToArena(p, arena) {
  const { hx, hy } = boardSize(arena)
  const lx = hx - PLAYER_RADIUS * 0.6
  const ly = hy - PLAYER_RADIUS * 0.6
  if (Math.abs(p.x) <= lx && Math.abs(p.y) <= ly) return p
  return clampBox(p.x, p.y, lx, ly)
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
