// The board: polished Calacatta and espresso marble squares with gold inlay,
// a gold compass-star medallion and a gold-and-walnut frame. The texture is
// built once and mapped onto the board through the renderer's 3D camera.

import { boardSize, BOARD_X, BOARD_Y } from './core.js'

const TAU = Math.PI * 2

function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

// --- Marble board texture (built once) -----------------------------------------------

const TILE = 96
let boardTex = null

function marbleTile(g, x0, y0, light, seed) {
  const r = (k) => hash(seed + ':' + k)
  // Calacatta gold (ivory with gold veining) and a deep espresso marble
  const bg = g.createLinearGradient(x0, y0, x0 + TILE, y0 + TILE)
  if (light) {
    bg.addColorStop(0, '#fffdf8')
    bg.addColorStop(0.55, '#f6f0e4')
    bg.addColorStop(1, '#fbf6ec')
  } else {
    bg.addColorStop(0, '#4a2b18')
    bg.addColorStop(0.55, '#2f1a0d')
    bg.addColorStop(1, '#3d2314')
  }
  g.fillStyle = bg
  g.fillRect(x0, y0, TILE, TILE)
  g.save()
  g.beginPath()
  g.rect(x0, y0, TILE, TILE)
  g.clip()
  // soft clouding in the stone
  for (let k = 0; k < 5; k++) {
    const cx = x0 + r('cx' + k) * TILE
    const cy = y0 + r('cy' + k) * TILE
    const rad = TILE * (0.25 + r('cr' + k) * 0.45)
    const cg = g.createRadialGradient(cx, cy, 0, cx, cy, rad)
    const c = light ? '215,200,178' : '96,60,34'
    cg.addColorStop(0, `rgba(${c},${light ? 0.2 : 0.35})`)
    cg.addColorStop(1, `rgba(${c},0)`)
    g.fillStyle = cg
    g.fillRect(x0, y0, TILE, TILE)
  }
  // one flowing gold vein, softened by a wider, fainter halo
  const sx = x0 - 10 + r('sx') * (TILE + 20)
  const ex = x0 - 10 + r('ex') * (TILE + 20)
  const vein = (w, a) => {
    g.strokeStyle = light ? `rgba(184,148,84,${a})` : `rgba(222,180,104,${a})`
    g.lineWidth = w
    g.beginPath()
    g.moveTo(sx, y0 - 10)
    g.bezierCurveTo(x0 + r('c1x') * TILE, y0 + r('c1y') * TILE * 0.5, x0 + r('c2x') * TILE, y0 + TILE * 0.5 + r('c2y') * TILE * 0.5, ex, y0 + TILE + 10)
    g.stroke()
  }
  if (r('has') < 0.75) {
    vein(7, light ? 0.07 : 0.06)
    vein(1.6, light ? 0.45 : 0.35)
  }
  g.restore()
  // bevel: light catches the top/left edge, shadow on the bottom/right
  g.fillStyle = light ? 'rgba(255,255,255,0.7)' : 'rgba(255,220,180,0.14)'
  g.fillRect(x0, y0, TILE, 2)
  g.fillRect(x0, y0, 2, TILE)
  g.fillStyle = light ? 'rgba(120,96,60,0.22)' : 'rgba(0,0,0,0.35)'
  g.fillRect(x0, y0 + TILE - 2, TILE, 2)
  g.fillRect(x0 + TILE - 2, y0, 2, TILE)
}

// A gold compass-star medallion inlaid where the four middle squares meet.
function medallion(g, cx, cy, R) {
  g.save()
  g.translate(cx, cy)
  const disc = g.createRadialGradient(0, -R * 0.3, R * 0.1, 0, 0, R)
  disc.addColorStop(0, '#fffaf0')
  disc.addColorStop(1, '#efe4cf')
  g.fillStyle = disc
  g.beginPath()
  g.arc(0, 0, R, 0, TAU)
  g.fill()
  const gold = g.createLinearGradient(-R, -R, R, R)
  gold.addColorStop(0, '#f8e7a1')
  gold.addColorStop(0.5, '#c9a43a')
  gold.addColorStop(1, '#8a6a1c')
  // eight-point star: long gold points, short espresso points between them
  for (const [pts, rOut, col] of [[8, R * 0.62, '#3b2214'], [4, R * 0.92, gold]]) {
    for (let i = 0; i < pts; i++) {
      const a = (i / pts) * TAU + (pts === 8 ? Math.PI / 8 : 0)
      const w = pts === 8 ? 0.22 : 0.3
      g.fillStyle = col
      g.beginPath()
      g.moveTo(0, 0)
      g.lineTo(Math.cos(a - w) * R * 0.22, Math.sin(a - w) * R * 0.22)
      g.lineTo(Math.cos(a) * rOut, Math.sin(a) * rOut)
      g.lineTo(Math.cos(a + w) * R * 0.22, Math.sin(a + w) * R * 0.22)
      g.closePath()
      g.fill()
    }
  }
  g.strokeStyle = gold
  g.lineWidth = R * 0.06
  g.beginPath()
  g.arc(0, 0, R * 0.97, 0, TAU)
  g.stroke()
  g.lineWidth = R * 0.02
  g.beginPath()
  g.arc(0, 0, R * 0.86, 0, TAU)
  g.stroke()
  g.fillStyle = gold
  g.beginPath()
  g.arc(0, 0, R * 0.1, 0, TAU)
  g.fill()
  g.restore()
}

export function boardTexture() {
  if (boardTex) return boardTex
  const c = document.createElement('canvas')
  c.width = BOARD_X * TILE
  c.height = BOARD_Y * TILE
  const g = c.getContext('2d')
  for (let j = 0; j < BOARD_Y; j++) {
    for (let i = 0; i < BOARD_X; i++) marbleTile(g, i * TILE, j * TILE, (i + j) % 2 === 0, 't' + i + ',' + j)
  }
  // gold inlay between the squares, with a bright highlight line
  g.strokeStyle = '#b8902e'
  g.lineWidth = 4
  g.beginPath()
  for (let i = 0; i <= BOARD_X; i++) { g.moveTo(i * TILE, 0); g.lineTo(i * TILE, c.height) }
  for (let j = 0; j <= BOARD_Y; j++) { g.moveTo(0, j * TILE); g.lineTo(c.width, j * TILE) }
  g.stroke()
  g.strokeStyle = 'rgba(255,244,200,0.8)'
  g.lineWidth = 1.2
  g.stroke()
  medallion(g, (BOARD_X / 2) * TILE, (BOARD_Y / 2) * TILE, TILE * 0.95)
  boardTex = c
  return c
}

// Draw the texture onto the projected board, two affine triangles per square.
function texTri(g, tex, s0, s1, s2, d0, d1, d2) {
  // map texture triangle (s0,s1,s2) onto screen triangle (d0,d1,d2)
  const den = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y)
  if (!den) return
  const a = ((d1.x - d0.x) * (s2.y - s0.y) - (d2.x - d0.x) * (s1.y - s0.y)) / den
  const b = ((d1.y - d0.y) * (s2.y - s0.y) - (d2.y - d0.y) * (s1.y - s0.y)) / den
  const c = ((d2.x - d0.x) * (s1.x - s0.x) - (d1.x - d0.x) * (s2.x - s0.x)) / den
  const d = ((d2.y - d0.y) * (s1.x - s0.x) - (d1.y - d0.y) * (s2.x - s0.x)) / den
  const e = d0.x - a * s0.x - c * s0.y
  const f = d0.y - b * s0.x - d * s0.y
  g.save()
  g.beginPath()
  // grow the clip a hair so neighbouring triangles never show a seam
  const cx = (d0.x + d1.x + d2.x) / 3
  const cy = (d0.y + d1.y + d2.y) / 3
  const grow = (p) => ({ x: p.x + Math.sign(p.x - cx) * 0.6, y: p.y + Math.sign(p.y - cy) * 0.6 })
  const p0 = grow(d0)
  const p1 = grow(d1)
  const p2 = grow(d2)
  g.moveTo(p0.x, p0.y)
  g.lineTo(p1.x, p1.y)
  g.lineTo(p2.x, p2.y)
  g.closePath()
  g.clip()
  g.transform(a, b, c, d, e, f)
  g.drawImage(tex, 0, 0)
  g.restore()
}

// Total width of the frame round the board (world units).
export function frameWidth(hx, hy) {
  return Math.max(hx, hy) * 0.045
}

export function drawBoardTop(r, g, E, t, phase) {
  const { hx, hy } = boardSize(E)
  const tex = boardTexture()
  const grid = []
  for (let j = 0; j <= BOARD_Y; j++) {
    const row = []
    for (let i = 0; i <= BOARD_X; i++) row.push(r.proj(-hx + (2 * hx * i) / BOARD_X, -hy + (2 * hy * j) / BOARD_Y, 0))
    grid.push(row)
  }
  // underlay so nothing ever shows through between triangles
  g.fillStyle = '#9c8466'
  r.poly(g, [grid[0][0], grid[0][BOARD_X], grid[BOARD_Y][BOARD_X], grid[BOARD_Y][0]])
  g.fill()
  for (let j = 0; j < BOARD_Y; j++) {
    for (let i = 0; i < BOARD_X; i++) {
      const s00 = { x: i * TILE, y: j * TILE }
      const s10 = { x: (i + 1) * TILE, y: j * TILE }
      const s01 = { x: i * TILE, y: (j + 1) * TILE }
      const s11 = { x: (i + 1) * TILE, y: (j + 1) * TILE }
      const a = grid[j][i]
      const b = grid[j][i + 1]
      const c = grid[j + 1][i + 1]
      const d = grid[j + 1][i]
      texTri(g, tex, s00, s10, s01, a, b, d)
      texTri(g, tex, s10, s11, s01, b, c, d)
    }
  }
  // Polished: floodlight reflections and a soft sheen.
  const corners = [grid[0][0], grid[0][BOARD_X], grid[BOARD_Y][BOARD_X], grid[BOARD_Y][0]]
  g.save()
  r.poly(g, corners)
  g.clip()
  g.globalCompositeOperation = 'lighter'
  const top = Math.min(corners[0].y, corners[1].y)
  const bot = Math.max(corners[2].y, corners[3].y)
  for (const fx of [0.22, 0.78]) {
    const x = corners[3].x + (corners[2].x - corners[3].x) * fx
    const w = Math.max(1, Math.abs(corners[2].x - corners[3].x) * 0.09)
    const lg = g.createLinearGradient(0, top, 0, bot)
    lg.addColorStop(0, 'rgba(255,250,235,0.16)')
    lg.addColorStop(0.6, 'rgba(255,250,235,0.05)')
    lg.addColorStop(1, 'rgba(255,250,235,0)')
    g.fillStyle = lg
    g.beginPath()
    g.ellipse(x, (top + bot) / 2, w, (bot - top) * 0.6, 0, 0, TAU)
    g.fill()
  }
  g.globalCompositeOperation = 'source-over'
  const vg = g.createLinearGradient(0, top, 0, bot)
  vg.addColorStop(0, 'rgba(0,0,0,0.2)')
  vg.addColorStop(0.45, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(0,0,0,0.06)')
  g.fillStyle = vg
  g.fillRect(0, 0, r.w, r.h)
  if (phase === 'scramble' || phase === 'result') {
    g.fillStyle = 'rgba(255,40,60,0.06)'
    g.fillRect(0, 0, r.w, r.h)
  }
  g.restore()
  // frame: gold lip, a walnut band, then an outer gold lip
  const band = (d0, d1, fill) => {
    const outer = [[-hx - d1, -hy - d1], [hx + d1, -hy - d1], [hx + d1, hy + d1], [-hx - d1, hy + d1]].map(([x, y]) => r.proj(x, y, 0))
    const inner = [[-hx - d0, -hy - d0], [hx + d0, -hy - d0], [hx + d0, hy + d0], [-hx - d0, hy + d0]].map(([x, y]) => r.proj(x, y, 0))
    g.fillStyle = fill(outer)
    g.beginPath()
    outer.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)))
    g.closePath()
    inner.slice().reverse().forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)))
    g.closePath()
    g.fill('evenodd')
  }
  const fw = frameWidth(hx, hy)
  const goldFill = (o) => {
    const gg = g.createLinearGradient(0, o[0].y, 0, o[2].y)
    gg.addColorStop(0, '#fbeeb0')
    gg.addColorStop(0.5, '#c9a43a')
    gg.addColorStop(1, '#8a6a1c')
    return gg
  }
  band(0, fw * 0.16, goldFill)
  band(fw * 0.16, fw * 0.84, (o) => {
    const wg = g.createLinearGradient(o[0].x, o[0].y, o[2].x, o[2].y)
    wg.addColorStop(0, '#5a3420')
    wg.addColorStop(0.5, '#3a2112')
    wg.addColorStop(1, '#4b2a17')
    return wg
  })
  band(fw * 0.84, fw, goldFill)
  return fw
}

// Bonus tiles: the round's gold and silver squares, glowing and shimmering so
// you can see a chair (or a throne!) roll onto one. Grab a chair while it's on
// one for extra points: gold pays more than silver.
const TILE_LOOK = {
  gold: { hi: '255,236,150', mid: '230,180,40', lo: '180,120,20', edge: '255,250,210' },
  silver: { hi: '250,252,255', mid: '190,200,212', lo: '120,132,146', edge: '255,255,255' },
}
export function drawGoldTiles(r, g, round, E, t) {
  const sets = [['silver', round?.silver], ['gold', round?.gold]]
  const { hx, hy, tile } = boardSize(E)
  g.save()
  for (const [kind, tiles] of sets) {
    if (!tiles?.length) continue
    const L = TILE_LOOK[kind]
    tiles.forEach(([i, j], n) => {
      const x0 = -hx + i * tile
      const y0 = -hy + j * tile
      const inset = tile * 0.04
      const pts = [[x0 + inset, y0 + inset], [x0 + tile - inset, y0 + inset], [x0 + tile - inset, y0 + tile - inset], [x0 + inset, y0 + tile - inset]].map(([x, y]) => r.proj(x, y, 0.5))
      const q = 0.5 + 0.5 * Math.sin(t * 3 + n * 1.7 + (kind === 'silver' ? 1 : 0))
      const gg = g.createLinearGradient(pts[0].x, pts[0].y, pts[2].x, pts[2].y)
      gg.addColorStop(0, `rgba(${L.hi},${0.75 + 0.2 * q})`)
      gg.addColorStop(0.5, `rgba(${L.mid},${0.8 + 0.15 * q})`)
      gg.addColorStop(1, `rgba(${L.lo},0.85)`)
      g.fillStyle = gg
      r.poly(g, pts)
      g.fill()
      g.strokeStyle = `rgba(${L.edge},${0.6 + 0.4 * q})`
      g.lineWidth = 2
      g.stroke()
      // a sweeping shine, then a star (gold) or a diamond (silver) in the middle
      const u = (t * 0.6 + n * 0.23) % 1
      const a = r.proj(x0 + tile * u, y0, 0.6)
      const b = r.proj(x0 + tile * Math.max(0, u - 0.25), y0 + tile, 0.6)
      g.strokeStyle = 'rgba(255,255,240,0.45)'
      g.lineWidth = Math.max(2, tile * 0.08 * a.k)
      g.beginPath()
      g.moveTo(a.x, a.y)
      g.lineTo(b.x, b.y)
      g.stroke()
      const c = r.proj(x0 + tile / 2, y0 + tile / 2, 0.6)
      const R = tile * (kind === 'gold' ? 0.22 : 0.17) * c.k
      g.fillStyle = 'rgba(255,255,240,0.9)'
      g.beginPath()
      const pointsN = kind === 'gold' ? 10 : 4
      for (let k = 0; k < pointsN; k++) {
        const ang = -Math.PI / 2 + (k * TAU) / pointsN
        const rr = kind === 'gold' && k % 2 ? R * 0.42 : R
        const px = c.x + Math.cos(ang) * rr
        const py = c.y + Math.sin(ang) * rr * r.cosT
        k ? g.lineTo(px, py) : g.moveTo(px, py)
      }
      g.closePath()
      g.fill()
    })
  }
  g.restore()
}
