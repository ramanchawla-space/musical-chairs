// The setting: a tropical beach. The marble board sits on a raised wooden
// deck on golden sand; behind it a turquoise sea rolls in under the sky,
// with a sailboat, a little island and seagulls on the horizon. Palm trees
// sway, festoon lights hang between poles, tiki torches flicker at the deck
// corners, beach umbrellas shade loungers in the margins and a crowd of
// holidaymakers stands round the deck watching, drinking and cheering.
//
// The sea and sky are painted in screen space (behind everything); the sand,
// deck, palms, lights and torches live in the world and go through the
// renderer's 3D camera (r.proj). Everything moves gently, never in your way.

import { boardSize } from './core.js'
import { frameWidth } from './board.js'
import { drawPerson } from './people.js'

const TAU = Math.PI * 2

function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

// Times of day (the host's "vibe").
export const SKIES = {
  neon: {
    label: 'Sunny Day', blurb: 'Blue sky, turquoise sea',
    sky: ['#3f8fd8', '#8cc4ef', '#d9eef9'], sun: { x: 0.78, y: 0.3, r: 0.03, c: '255,250,228' },
    sea: ['#1e6fae', '#22a3c4', '#5fd6cf'], sand: ['#f6e2b5', '#ecd099'], lights: 0.35, tint: null,
  },
  cosmic: {
    label: 'Twilight', blurb: 'Dusk sky, lights twinkling',
    sky: ['#25336e', '#7b6bb8', '#f2b2b6'], moon: { x: 0.24, y: 0.35 },
    sea: ['#23396f', '#3f5c98', '#86a2cc'], sand: ['#dcc6a6', '#c7ad8a'], lights: 1, tint: 'rgba(40,30,100,0.08)',
  },
  sunset: {
    label: 'Golden Hour', blurb: 'The sun sinks into the sea',
    sky: ['#3f4f9c', '#e88a58', '#ffd08a'], sun: { x: 0.5, y: 0.97, r: 0.075, c: '255,196,110' },
    sea: ['#2c5a96', '#3b87ab', '#e8a46c'], sand: ['#f3d19a', '#e0b57a'], lights: 0.8, tint: 'rgba(255,140,60,0.06)',
  },
}

// Plain sky for screens without a board (home page).
export function drawSky(r, g, t, theme) {
  const sky = SKIES[theme] || SKIES.neon
  const bg = g.createLinearGradient(0, 0, 0, r.h)
  bg.addColorStop(0, sky.sky[0])
  bg.addColorStop(0.6, sky.sky[1])
  bg.addColorStop(1, sky.sky[2])
  g.fillStyle = bg
  g.fillRect(0, 0, r.w, r.h)
  clouds(r, g, t, r.h * 0.5, theme)
}

function clouds(r, g, t, bottom, theme) {
  for (let i = 0; i < 6; i++) {
    const cx = (((hash('cx' + i) * 1.4 + t * 0.004 * (0.5 + hash('cv' + i))) % 1.4) - 0.2) * r.w
    const cy = (0.12 + hash('cy' + i) * 0.55) * bottom
    const s = (0.07 + hash('cs' + i) * 0.08) * r.w
    g.fillStyle = theme === 'cosmic' ? 'rgba(255,210,230,0.3)' : theme === 'sunset' ? 'rgba(255,225,200,0.5)' : 'rgba(255,255,255,0.65)'
    for (let k = 0; k < 5; k++) {
      g.beginPath()
      g.ellipse(cx + (k - 2) * s * 0.33, cy + Math.sin(k * 2.1 + i) * s * 0.05, s * (0.28 + hash('ck' + i + k) * 0.22), s * 0.13, 0, 0, TAU)
      g.fill()
    }
  }
}

// --- Layout ------------------------------------------------------------------------------

const BASE = -30 // the sand (the board's top is at 0)
const DECK_Z = -6

function layout(E) {
  const { hx, hy } = boardSize(E)
  const fw = frameWidth(hx, hy)
  const deck = Math.max(50, hx * 0.07)
  const dx = hx + fw + deck // deck half-size
  const dy = hy + fw + deck
  const shore = -(dy + 70) // where the water meets the sand (behind the board)
  return { hx, hy, fw, dx, dy, shore }
}

// How far from the middle the screen edge is (world units) along row y, on
// side sx (-1 left, +1 right). The board is framed off-centre (room for the
// scoreboard on the left), so the two margins differ.
function edgeDist(r, y, sx, z = BASE) {
  const p = r.proj(0, y, z)
  return sx > 0 ? (r.w - p.x) / p.k : p.x / p.k
}

// Where to put something `want` beyond the deck's side, pulled in so it
// stays on screen (keeping `pad` clear of the edge), but never onto the deck.
function sideX(r, L, y, sx, want, pad) {
  const avail = edgeDist(r, y, sx) - pad
  return sx * Math.max(L.dx + pad * 0.45, Math.min(L.dx + want, avail))
}

function palmsFor(L, r) {
  const { dx, dy, shore } = L
  const P = (x, y, h, lean, id) => {
    // side and front palms: keep the trunk on screen
    if (r && id[0] !== 'b') x = sideX(r, L, y, Math.sign(x), Math.abs(x) - dx, 40)
    return { x, y, h, lean, id }
  }
  return [
    // back, along the shore
    P(-dx * 0.78, shore + 26, 300, -0.5, 'b1'), P(-dx * 0.42, shore + 10, 250, 0.35, 'b2'),
    P(dx * 0.5, shore + 18, 320, 0.45, 'b3'), P(dx * 0.86, shore + 34, 260, -0.3, 'b4'),
    // the sides
    P(-dx - 110, -dy * 0.55, 330, -0.6, 's1'), P(dx + 120, -dy * 0.35, 310, 0.55, 's2'),
    P(-dx - 150, dy * 0.15, 280, -0.4, 's3'), P(dx + 160, dy * 0.25, 300, 0.5, 's4'),
    // front corners: framing the view, drawn over everything
    P(-dx - 90, dy + 60, 360, 0.45, 'f1'), P(dx + 100, dy + 50, 340, -0.5, 'f2'),
  ]
}

// --- Drawing -------------------------------------------------------------------------------

function quad(r, g, pts, fill) {
  g.fillStyle = fill
  r.poly(g, pts.map(([x, y, z]) => r.proj(x, y, z)))
  g.fill()
}

// Behind the board: sky, sun, sea, sand, deck, back palms, lights, torches.
export function drawBeach(r, g, E, t, phase, theme) {
  const sky = SKIES[theme] || SKIES.neon
  const L = layout(E)
  const { dx, dy, shore } = L
  const W = Math.max(dx, dy) * 6
  const sh0 = r.proj(-W, shore, BASE)
  const sh1 = r.proj(W, shore, BASE)
  const shoreY = Math.min(sh0.y, sh1.y)
  const horizon = Math.max(24, Math.min(shoreY - 40, shoreY * 0.42))

  // sky down to the horizon
  const sg = g.createLinearGradient(0, 0, 0, horizon)
  sg.addColorStop(0, sky.sky[0])
  sg.addColorStop(0.65, sky.sky[1])
  sg.addColorStop(1, sky.sky[2])
  g.fillStyle = sg
  g.fillRect(0, 0, r.w, horizon + 2)
  // sun / moon
  let sunX = null
  if (sky.sun) {
    const s = sky.sun
    sunX = r.w * s.x
    const sy = horizon * s.y
    const R = Math.min(r.w, r.h) * s.r
    const glow = g.createRadialGradient(sunX, sy, 0, sunX, sy, R * 9)
    glow.addColorStop(0, `rgba(${s.c},0.9)`)
    glow.addColorStop(0.12, `rgba(${s.c},0.45)`)
    glow.addColorStop(1, `rgba(${s.c},0)`)
    g.fillStyle = glow
    g.fillRect(0, 0, r.w, horizon)
    g.fillStyle = `rgb(${s.c})`
    g.beginPath()
    g.arc(sunX, sy, R, 0, TAU)
    g.fill()
  } else if (sky.moon) {
    const mx = r.w * sky.moon.x
    const my = horizon * sky.moon.y
    const R = Math.min(r.w, r.h) * 0.025
    g.fillStyle = 'rgba(255,250,235,0.95)'
    g.beginPath()
    g.arc(mx, my, R, 0, TAU)
    g.fill()
    g.fillStyle = sky.sky[1]
    g.beginPath()
    g.arc(mx + R * 0.45, my - R * 0.2, R * 0.9, 0, TAU)
    g.fill()
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(255,255,255,${0.3 + 0.5 * Math.abs(Math.sin(t * 0.8 + i))})`
      g.fillRect(hash('st' + i) * r.w, hash('sy' + i) * horizon * 0.7, 1.5, 1.5)
    }
  }
  clouds(r, g, t, horizon, theme)

  // a little island and a sailboat on the horizon
  island(g, r.w * 0.16, horizon, Math.min(r.w, r.h) * 0.09)
  const boatX = ((t * 6 + r.w * 0.7) % (r.w + 120)) - 60
  boat(g, boatX, horizon + 6, Math.max(8, Math.min(r.w, r.h) * 0.022), t)

  // the sea: deep at the horizon, turquoise by the shore
  const seaG = g.createLinearGradient(0, horizon, 0, shoreY)
  seaG.addColorStop(0, sky.sea[0])
  seaG.addColorStop(0.55, sky.sea[1])
  seaG.addColorStop(1, sky.sea[2])
  g.fillStyle = seaG
  g.fillRect(0, horizon, r.w, shoreY - horizon + 40)
  // glitter path under the sun
  if (sunX !== null) {
    // fine sparkles that twinkle and drift, widening towards the shore
    for (let i = 0; i < 160; i++) {
      const u = hash('gl' + i)
      const y = horizon + (shoreY - horizon) * u * u * 0.9
      const spread = 6 + u * r.w * 0.09
      const x = sunX + (hash('gx' + i) - 0.5) * spread * 2 + Math.sin(t * 0.6 + i) * 3
      const a = Math.max(0, Math.sin(t * 2.5 + i * 2.3)) * (0.35 + 0.5 * (1 - u))
      if (a < 0.05) continue
      g.fillStyle = `rgba(255,250,228,${a})`
      g.beginPath()
      g.ellipse(x, y, 1.5 + u * 4, 0.6 + u * 0.8, 0, 0, TAU)
      g.fill()
    }
  }
  // gentle swells rolling in towards the beach
  g.strokeStyle = 'rgba(255,255,255,0.35)'
  for (let i = 0; i < 9; i++) {
    const u = ((i / 9) + t * 0.025) % 1
    const y = horizon + (shoreY - horizon) * u * u
    g.globalAlpha = 0.15 + 0.6 * u
    g.lineWidth = 0.6 + u * 1.4
    g.beginPath()
    for (let x = 0; x <= r.w; x += 24) {
      const yy = y + Math.sin(x * 0.03 + i * 2 + t * 0.6) * (1 + u * 2)
      if (x) g.lineTo(x, yy)
      else g.moveTo(x, yy)
    }
    g.stroke()
  }
  g.globalAlpha = 1
  seagulls(g, r, t, horizon, shoreY)

  // sand from the water's edge to beyond the bottom of the screen
  const front = dy * 3
  const sandG = g.createLinearGradient(0, shoreY, 0, r.h)
  sandG.addColorStop(0, sky.sand[1])
  sandG.addColorStop(1, sky.sand[0])
  quad(r, g, [[-W, shore, BASE], [W, shore, BASE], [W, front, BASE], [-W, front, BASE]], sandG)
  // wet sand and the foam of each wave washing up
  quad(r, g, [[-W, shore, BASE], [W, shore, BASE], [W, shore + 45, BASE], [-W, shore + 45, BASE]], 'rgba(150,120,80,0.22)')
  const wash = 18 + 16 * Math.sin(t * 0.7)
  g.fillStyle = 'rgba(255,255,255,0.75)'
  g.beginPath()
  for (let i = 0; i <= 40; i++) {
    const x = -W * 0.4 + (W * 0.8 * i) / 40
    const p = r.proj(x, shore + wash + Math.sin(i * 1.3 + t) * 6, BASE)
    if (i) g.lineTo(p.x, p.y)
    else g.moveTo(p.x, p.y)
  }
  for (let i = 40; i >= 0; i--) {
    const x = -W * 0.4 + (W * 0.8 * i) / 40
    const p = r.proj(x, shore - 4, BASE)
    g.lineTo(p.x, p.y)
  }
  g.closePath()
  g.fill()
  // a few shells and starfish
  for (let i = 0; i < 14; i++) {
    const side = hash('shs' + i) < 0.5 ? -1 : 1
    const x = side * (dx + 30 + hash('shx' + i) * 260)
    const y = shore + 60 + hash('shy' + i) * (dy * 2.2)
    const p = r.proj(x, y, BASE)
    const k = p.k
    if (i % 3 === 0) starfish(g, p.x, p.y, 7 * k, hash('sr' + i) * TAU)
    else {
      g.fillStyle = i % 2 ? '#fff3e6' : '#f2c6b4'
      g.beginPath()
      g.ellipse(p.x, p.y, 4 * k, 2.6 * k, 0, 0, TAU)
      g.fill()
    }
  }

  // umbrellas and loungers in the margins, pulled in to stay on screen
  for (const [sx, y] of [[-1, -dy * 0.2], [1, -dy * 0.25], [-1, dy * 0.55], [1, dy * 0.5]]) {
    const ux = sideX(r, L, y - 20, sx, 260, 70)
    lounger(r, g, ux - sx * 30, y, sx)
    umbrella(r, g, ux, y - 20, t, sx > 0 ? '#e53935' : '#1e88e5')
  }

  // festoon lights strung between bamboo poles round the back and sides
  festoon(r, g, L, t, sky.lights)
  // the deck the board stands on
  deck(r, g, L)
  // back palms and back torches (behind the board)
  for (const p of palmsFor(L, r)) if (p.id[0] !== 'f') palm(r, g, p, t)
  // the crowd watching from the sand
  spectators(r, g, L, t, phase)
  for (const sx of [-1, 1]) torch(r, g, sx * (dx - 14), -(dy - 14), t)
  if (sky.tint) {
    g.fillStyle = sky.tint
    g.fillRect(0, 0, r.w, r.h)
  }
}

// In front of everything: the front torches and the palms framing the view.
export function drawBeachFront(r, g, E, t) {
  const L = layout(E)
  for (const sx of [-1, 1]) torch(r, g, sx * (L.dx - 14), L.dy - 14, t)
  for (const p of palmsFor(L, r)) if (p.id[0] === 'f') palm(r, g, p, t)
}

// --- Pieces ------------------------------------------------------------------------------------

function deck(r, g, L) {
  const { dx, dy } = L
  // side faces turned to the camera
  const C = [[-dx, -dy], [dx, -dy], [dx, dy], [-dx, dy]]
  const normals = [[0, -1], [1, 0], [0, 1], [-1, 0]]
  for (let e = 0; e < 4; e++) {
    const [nx, ny] = normals[e]
    if (nx * r.sinY + ny * r.cosY <= 0) continue
    const [ax, ay] = C[e]
    const [bx, by] = C[(e + 1) % 4]
    quad(r, g, [[ax, ay, DECK_Z], [bx, by, DECK_Z], [bx, by, BASE], [ax, ay, BASE]], '#7a5232')
  }
  // planks
  const top = C.map(([x, y]) => r.proj(x, y, DECK_Z))
  const tg = g.createLinearGradient(0, top[0].y, 0, top[2].y)
  tg.addColorStop(0, '#b48553')
  tg.addColorStop(1, '#c99a66')
  g.fillStyle = tg
  r.poly(g, top)
  g.fill()
  g.strokeStyle = 'rgba(90,55,25,0.45)'
  g.lineWidth = 1
  const n = Math.round((2 * dy) / 26)
  for (let i = 1; i < n; i++) {
    const y = -dy + (2 * dy * i) / n
    const a = r.proj(-dx, y, DECK_Z)
    const b = r.proj(dx, y, DECK_Z)
    g.beginPath()
    g.moveTo(a.x, a.y)
    g.lineTo(b.x, b.y)
    g.stroke()
  }
  // the board casts a soft shadow on the deck
  const sh = [[-L.hx - L.fw - 10, -L.hy - L.fw + 6], [L.hx + L.fw + 10, -L.hy - L.fw + 6], [L.hx + L.fw + 14, L.hy + L.fw + 16], [-L.hx - L.fw - 14, L.hy + L.fw + 16]]
  quad(r, g, sh.map(([x, y]) => [x, y, DECK_Z]), 'rgba(60,35,10,0.35)')
}

function palm(r, g, p, t) {
  const sway = Math.sin(t * 0.7 + hash(p.id) * 6) * 0.04
  const segs = 10
  const pts = []
  for (let i = 0; i <= segs; i++) {
    const u = i / segs
    const bend = (p.lean + sway) * u * u * p.h * 0.35
    pts.push(r.proj(p.x + bend, p.y, BASE + u * p.h))
  }
  const k = pts[0].k
  // trunk: tapering, with ring marks
  for (let i = 0; i < segs; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    g.strokeStyle = i % 2 ? '#8a6640' : '#9b7449'
    g.lineWidth = Math.max(2, (13 - i * 0.7) * k)
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(a.x, a.y)
    g.lineTo(b.x, b.y)
    g.stroke()
  }
  const top = pts[segs]
  const kt = top.k
  // fronds
  const n = 9
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + hash(p.id + 'a') * 2 + Math.sin(t * 0.9 + i) * 0.05
    const len = (95 + hash(p.id + i) * 35) * kt
    const tipX = top.x + Math.cos(a) * len
    const tipY = top.y + Math.sin(a) * len * 0.45 + len * 0.42 // they droop
    const midX = top.x + Math.cos(a) * len * 0.55
    const midY = top.y + Math.sin(a) * len * 0.25 - len * 0.12
    const nx = -Math.sin(a)
    const ny = Math.cos(a) * 0.5
    const wdt = 13 * kt
    const lg = g.createLinearGradient(top.x, top.y, tipX, tipY)
    lg.addColorStop(0, '#2f7d32')
    lg.addColorStop(1, '#66bb4a')
    g.fillStyle = lg
    g.beginPath()
    g.moveTo(top.x, top.y)
    g.quadraticCurveTo(midX + nx * wdt, midY + ny * wdt, tipX, tipY)
    g.quadraticCurveTo(midX - nx * wdt, midY - ny * wdt, top.x, top.y)
    g.fill()
    g.strokeStyle = 'rgba(30,70,25,0.6)'
    g.lineWidth = Math.max(0.6, 1.2 * kt)
    g.beginPath()
    g.moveTo(top.x, top.y)
    g.quadraticCurveTo(midX, midY, tipX, tipY)
    g.stroke()
  }
  g.fillStyle = '#5d3b1e'
  for (let i = 0; i < 3; i++) {
    g.beginPath()
    g.arc(top.x + (i - 1) * 6 * kt, top.y + 6 * kt, 5 * kt, 0, TAU)
    g.fill()
  }
}

function torch(r, g, x, y, t) {
  const b = r.proj(x, y, DECK_Z)
  const top = r.proj(x, y, 110)
  const k = top.k
  g.strokeStyle = '#a07a45'
  g.lineWidth = Math.max(2, 5 * k)
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(b.x, b.y)
  g.lineTo(top.x, top.y)
  g.stroke()
  g.fillStyle = '#6b4a2a'
  g.fillRect(top.x - 6 * k, top.y - 4 * k, 12 * k, 12 * k)
  const fl = 1 + 0.15 * Math.sin(t * 13 + x) + 0.1 * Math.sin(t * 21 + y)
  g.save()
  g.globalCompositeOperation = 'lighter'
  const glow = g.createRadialGradient(top.x, top.y - 12 * k, 0, top.x, top.y - 12 * k, 45 * k)
  glow.addColorStop(0, 'rgba(255,170,60,0.5)')
  glow.addColorStop(1, 'rgba(255,120,30,0)')
  g.fillStyle = glow
  g.fillRect(top.x - 45 * k, top.y - 57 * k, 90 * k, 90 * k)
  g.restore()
  for (const [col, s] of [['#ff7a1a', 1], ['#ffd34d', 0.55]]) {
    g.fillStyle = col
    g.beginPath()
    g.moveTo(top.x - 7 * k * s, top.y - 3 * k)
    g.quadraticCurveTo(top.x - 8 * k * s, top.y - 18 * k * s * fl, top.x + Math.sin(t * 9 + x) * 2 * k, top.y - 30 * k * s * fl)
    g.quadraticCurveTo(top.x + 8 * k * s, top.y - 18 * k * s * fl, top.x + 7 * k * s, top.y - 3 * k)
    g.closePath()
    g.fill()
  }
}

function festoon(r, g, L, t, bright) {
  const { dx, dy } = L
  const yb = -(dy + 30)
  const xs = dx + 40
  // poles: along the back, then down both sides
  const poles = []
  for (let i = 0; i <= 4; i++) poles.push([-xs + (2 * xs * i) / 4, yb])
  const left = [[-xs, yb], [-xs, -dy * 0.2], [-xs, dy * 0.6]]
  const right = [[xs, yb], [xs, -dy * 0.2], [xs, dy * 0.6]]
  const H = 175
  for (const [x, y] of [...poles, ...left.slice(1), ...right.slice(1)]) {
    const a = r.proj(x, y, BASE)
    const b = r.proj(x, y, H)
    g.strokeStyle = '#a7834f'
    g.lineWidth = Math.max(1.5, 4 * a.k)
    g.beginPath()
    g.moveTo(a.x, a.y)
    g.lineTo(b.x, b.y)
    g.stroke()
  }
  const colors = ['#ffd54a', '#ff8a65', '#81d4fa', '#aed581', '#f48fb1']
  const strand = (pts) => {
    for (let s = 0; s < pts.length - 1; s++) {
      const [x0, y0] = pts[s]
      const [x1, y1] = pts[s + 1]
      const n = 14
      const line = []
      for (let i = 0; i <= n; i++) {
        const u = i / n
        const sag = Math.sin(u * Math.PI) * 38
        line.push(r.proj(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, H - 6 - sag))
      }
      g.strokeStyle = 'rgba(60,45,30,0.7)'
      g.lineWidth = 1
      g.beginPath()
      line.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)))
      g.stroke()
      for (let i = 1; i < n; i++) {
        const p = line[i]
        const col = colors[(s * n + i) % colors.length]
        const tw = 0.75 + 0.25 * Math.sin(t * 2 + i * 1.3 + s)
        const rad = Math.max(1.5, 3.2 * p.k)
        if (bright > 0.5) {
          g.save()
          g.globalCompositeOperation = 'lighter'
          g.globalAlpha = 0.35 * bright * tw
          g.fillStyle = col
          g.beginPath()
          g.arc(p.x, p.y + rad, rad * 3.2, 0, TAU)
          g.fill()
          g.restore()
        }
        g.fillStyle = col
        g.globalAlpha = 0.7 + 0.3 * tw
        g.beginPath()
        g.arc(p.x, p.y + rad, rad, 0, TAU)
        g.fill()
        g.globalAlpha = 1
      }
    }
  }
  strand(poles)
  strand(left)
  strand(right)
}

function lounger(r, g, x, y, sx) {
  const pts = [[x - 22, y - 45], [x + 22, y - 45], [x + 22, y + 45], [x - 22, y + 45]]
  quad(r, g, pts.map(([a, b]) => [a + 4, b + 6, BASE]), 'rgba(120,90,50,0.25)')
  quad(r, g, pts.map(([a, b]) => [a, b, BASE + 12]), '#f5f5f5')
  for (let i = 0; i < 4; i++) {
    const y0 = y - 45 + i * 22.5
    quad(r, g, [[x - 22, y0, BASE + 12.5], [x + 22, y0, BASE + 12.5], [x + 22, y0 + 11, BASE + 12.5], [x - 22, y0 + 11, BASE + 12.5]], sx > 0 ? '#ef9a9a' : '#90caf9')
  }
  // raised back rest
  quad(r, g, [[x - 22, y - 45, BASE + 12], [x + 22, y - 45, BASE + 12], [x + 22, y - 62, BASE + 40], [x - 22, y - 62, BASE + 40]], '#e8e8e8')
}

function umbrella(r, g, x, y, t, col) {
  const b = r.proj(x, y, BASE)
  const top = r.proj(x, y, BASE + 150)
  const k = top.k
  g.strokeStyle = '#ddd'
  g.lineWidth = Math.max(1.5, 3 * k)
  g.beginPath()
  g.moveTo(b.x, b.y)
  g.lineTo(top.x, top.y)
  g.stroke()
  const R = 75
  const n = 10
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU
    const a1 = ((i + 1) / n) * TAU
    const p0 = r.proj(x + Math.cos(a0) * R, y + Math.sin(a0) * R, BASE + 125)
    const p1 = r.proj(x + Math.cos(a1) * R, y + Math.sin(a1) * R, BASE + 125)
    g.fillStyle = i % 2 ? col : '#ffffff'
    g.beginPath()
    g.moveTo(top.x, top.y)
    g.lineTo(p0.x, p0.y)
    g.lineTo(p1.x, p1.y)
    g.closePath()
    g.fill()
  }
}

function starfish(g, x, y, R, rot) {
  g.fillStyle = '#f08a4b'
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = rot + (i / 10) * TAU
    const rr = i % 2 ? R * 0.42 : R
    const px = x + Math.cos(a) * rr
    const py = y + Math.sin(a) * rr * 0.55
    if (i) g.lineTo(px, py)
    else g.moveTo(px, py)
  }
  g.closePath()
  g.fill()
}

function island(g, x, horizon, s) {
  g.fillStyle = 'rgba(40,80,70,0.75)'
  g.beginPath()
  g.ellipse(x, horizon + 1, s, s * 0.18, 0, Math.PI, 0)
  g.fill()
  g.strokeStyle = 'rgba(40,70,50,0.8)'
  g.lineWidth = Math.max(1, s * 0.04)
  g.beginPath()
  g.moveTo(x + s * 0.1, horizon - s * 0.12)
  g.quadraticCurveTo(x + s * 0.18, horizon - s * 0.4, x + s * 0.12, horizon - s * 0.55)
  g.stroke()
  g.fillStyle = 'rgba(40,90,50,0.8)'
  for (let i = 0; i < 5; i++) {
    const a = Math.PI + (i / 4) * Math.PI
    g.beginPath()
    g.ellipse(x + s * 0.12 + Math.cos(a) * s * 0.14, horizon - s * 0.55 + Math.sin(a) * s * 0.05 + s * 0.03, s * 0.14, s * 0.035, a, 0, TAU)
    g.fill()
  }
}

function boat(g, x, y, s, t) {
  const bob = Math.sin(t * 1.3) * s * 0.06
  g.fillStyle = '#5a3d2b'
  g.beginPath()
  g.moveTo(x - s, y + bob)
  g.lineTo(x + s, y + bob)
  g.lineTo(x + s * 0.7, y + s * 0.3 + bob)
  g.lineTo(x - s * 0.7, y + s * 0.3 + bob)
  g.closePath()
  g.fill()
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.moveTo(x, y - s * 1.6 + bob)
  g.lineTo(x + s * 0.85, y - s * 0.1 + bob)
  g.lineTo(x, y - s * 0.1 + bob)
  g.closePath()
  g.fill()
  g.fillStyle = '#ffccbc'
  g.beginPath()
  g.moveTo(x - s * 0.08, y - s * 1.3 + bob)
  g.lineTo(x - s * 0.7, y - s * 0.1 + bob)
  g.lineTo(x - s * 0.08, y - s * 0.1 + bob)
  g.closePath()
  g.fill()
}

function seagulls(g, r, t, horizon, shoreY) {
  g.strokeStyle = 'rgba(255,255,255,0.9)'
  g.lineCap = 'round'
  for (let i = 0; i < 3; i++) {
    const x = (((t * (14 + i * 5) + hash('gx' + i) * r.w) % (r.w + 80)) - 40)
    const y = horizon * (0.35 + i * 0.18) + Math.sin(t * 0.8 + i) * 6
    const s = 7 + i * 2
    const flap = Math.sin(t * 4 + i * 2) * s * 0.35
    g.lineWidth = 1.6
    g.beginPath()
    g.moveTo(x - s, y - flap)
    g.quadraticCurveTo(x - s * 0.4, y - s * 0.4, x, y)
    g.quadraticCurveTo(x + s * 0.4, y - s * 0.4, x + s, y - flap)
    g.stroke()
  }
}

// --- The crowd -----------------------------------------------------------------------------
// Holidaymakers in beachwear standing round the deck: along the back (in
// front of the sea) and down both sides. They sip their drinks and sway to
// the music, go wild when it stops, and clap and cheer the results.

const SKIN = ['#f1cfae', '#c98e60', '#8a5634', '#e8b48a', '#5b3720', '#f6d7bd', '#b07448', '#d9a37a', '#7a4a2a']
const HAIR = ['#3b2416', '#141010', '#0d0a08', '#b87a3d', '#d9b26a', '#2a1a10', '#6a2c1a', '#e3c27a']
const CROWD = [
  { woman: false, look: { shorts: true, bare: true, bottom: '#ff7043', print: '#ffd54f', hat: 'straw', shades: true, sandals: true, style: 'short' }, drink: 'beer' },
  { woman: true, look: { bikini: true, sarong: true, top: '#e91e63', bottom: '#4dd0e1', hat: 'sun', shades: true, sandals: true, style: 'long' }, drink: 'cocktail' },
  { woman: false, look: { shorts: true, top: '#29b6f6', print: '#fff59d', bottom: '#f5f5f5', shades: true, sandals: true, style: 'fade' }, drink: 'coconut' },
  { woman: true, look: { bikini: true, shorts: true, top: '#ffca28', bottom: '#5c6bc0', sandals: true, style: 'pony' }, drink: null },
  { woman: false, look: { shorts: true, tank: true, top: '#ffffff', bottom: '#1e88e5', hat: 'cap', hatColor: '#e53935', sandals: true, style: 'buzz', beard: true }, drink: 'beer' },
  { woman: true, look: { bikini: true, sarong: true, top: '#26a69a', bottom: '#ff8a65', shades: true, sandals: true, style: 'curly' }, drink: 'cocktail' },
  { woman: false, look: { shorts: true, top: '#ef5350', print: '#ffffff', bottom: '#3949ab', hat: 'straw', sandals: true, style: 'side' }, drink: 'cocktail' },
  { woman: true, look: { tank: true, shorts: true, top: '#ab47bc', bottom: '#90caf9', hat: 'sun', hatColor: '#ffffff', sandals: true, style: 'bob' }, drink: 'coconut' },
  { woman: false, look: { shorts: true, bare: true, bottom: '#43a047', print: '#c5e1a5', shades: true, sandals: true, style: 'quiff' }, drink: null },
  { woman: true, look: { bikini: true, shorts: true, top: '#ff5252', bottom: '#f5f5f5', shades: true, sandals: true, style: 'bun' }, drink: 'beer' },
  { woman: false, look: { shorts: true, tank: true, top: '#ffb300', bottom: '#6d4c41', hat: 'cap', hatColor: '#1565c0', shades: true, sandals: true, style: 'short' }, drink: 'coconut' },
  { woman: true, look: { bikini: true, sarong: true, top: '#7e57c2', bottom: '#ffd54f', hat: 'sun', sandals: true, style: 'long' }, drink: null },
].map((c, i) => ({
  woman: c.woman,
  drink: c.drink,
  look: { skin: SKIN[(i * 5) % SKIN.length], hair: HAIR[(i * 3) % HAIR.length], top: '#ffffff', bottom: '#333333', ...c.look },
}))

function crowdSpots(r, L) {
  const { dx, dy } = L
  const spots = []
  // along the back, between the deck and the water
  for (const [fx, back] of [[-0.82, 30], [-0.6, 46], [-0.28, 34], [0.05, 48], [0.33, 30], [0.62, 44], [0.86, 32]]) {
    spots.push({ x: fx * dx, y: -(dy + back) })
  }
  // down the sides, in little groups
  for (const sx of [-1, 1]) {
    for (const [fy, out] of [[-0.62, 40], [-0.5, 78], [0.02, 44], [0.12, 80], [0.72, 46]]) {
      const y = fy * dy
      spots.push({ x: sideX(r, L, y, sx, out, 30), y })
    }
  }
  return spots
}

function spectators(r, g, L, t, phase) {
  const spots = crowdSpots(r, L).sort((a, b) => a.y - b.y)
  spots.forEach((sp, i) => {
    const who = CROWD[(i * 7) % CROWD.length]
    const foot = r.proj(sp.x, sp.y, BASE + 2)
    const head = r.proj(sp.x, sp.y, BASE + 2 + 118)
    const h = foot.y - head.y
    if (h < 4 || foot.x < -40 || foot.x > r.w + 40) return
    const seed = hash('crowd' + i)
    const beat = t * (3.2 + seed) + seed * 10
    let arms = 'swing'
    let lean = Math.sin(t * 1.6 + seed * 6) * 0.25
    if (phase === 'scramble') {
      arms = 'cheer' // the music stopped: everyone goes wild
      lean = Math.sin(t * 5 + seed * 6) * 0.5
    } else if (phase === 'result' || phase === 'levelup' || phase === 'winner') {
      arms = seed < 0.5 || who.drink ? 'cheer' : 'clap'
    } else if (phase === 'music') {
      arms = who.drink ? 'swing' : seed < 0.5 ? 'dance' : 'clap'
      lean = Math.sin(t * 3 + seed * 6) * 0.6
    } else if (!who.drink) {
      arms = Math.sin(t * 0.5 + seed * 9) > 0.6 ? 'clap' : 'swing'
    }
    const sip = Math.pow(Math.max(0, Math.sin(t * 0.45 + seed * 12)), 6)
    // soft shadow on the sand
    g.fillStyle = 'rgba(90,60,30,0.25)'
    g.beginPath()
    g.ellipse(foot.x, foot.y, 16 * foot.k, 6 * foot.k, 0, 0, TAU)
    g.fill()
    drawPerson(g, who, foot.x, foot.y, h, {
      walk: 0, stride: 0, arms, beat, lean,
      drink: arms === 'clap' ? null : who.drink, sip: arms === 'swing' ? sip : 0,
    })
  })
}
