// Canvas renderer: a themed backdrop, a big rectangular checkerboard floor
// seen in perspective, wooden chairs standing on it, real men and women
// walking, dancing and sitting, a pool of random hazards that only appear
// once the music stops (fog, birds, bouncers, disco balls, lasers, smoke,
// lights out...), the "BOOTED!" kick-out animation, reactions and confetti.
// While the music plays the scene is kept calm so you can follow the dance.

import { drawPerson } from './people.js'
import { drawBoardTop, frameWidth } from './board.js'
import { drawBeach, drawBeachFront, drawSky, SKIES } from './beach.js'
import { PLAYER_RADIUS, CHAIR_RADIUS, chairVisibility, chairLayout, chairPosAt, roundLevel, levelOf, roundTable, bouncers, BOUNCER_RADIUS, roamPos, boardSize, BOARD_X, BOARD_Y } from './core.js'
import { drawGoldTiles } from './board.js'

export const PERSON_HEIGHT = 124 // world units (a chair seat is 33 high)

export const THEME_INFO = {
  neon: {
    label: SKIES.neon.label, blurb: SKIES.neon.blurb,
    accent: '#ff3cac', accent2: '#00e5ff', chair: '#00e5ff', hue: 300, floor: 'rgba(12,0,30,0.5)',
  },
  cosmic: {
    label: SKIES.cosmic.label, blurb: SKIES.cosmic.blurb,
    accent: '#8b5cff', accent2: '#2bffc6', chair: '#b9a6ff', hue: 220, floor: 'rgba(4,2,22,0.42)',
  },
  sunset: {
    label: SKIES.sunset.label, blurb: SKIES.sunset.blurb,
    accent: '#ff2e88', accent2: '#ffb000', chair: '#ffcf4a', hue: 330, floor: 'rgba(30,0,40,0.5)',
  },
}

const TAU = Math.PI * 2

function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas
    this.g = canvas.getContext('2d')
    this.theme = 'neon'
    this.scale = 1
    this.view = { x: 0, y: 0, scale: 1 }
    this.particles = []
    this.reactions = []
    this.flashA = 0
    this.flashColor = '#fff'
    this.shake = 0
    this.time = 0
    this.yaw = 0
    this.tiltBob = 0
    this.gait = new Map() // per player: last position + walk phase, for the walk cycle
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    this.dpr = dpr
    this.w = window.innerWidth
    this.h = window.innerHeight
    this.canvas.width = Math.floor(this.w * dpr)
    this.canvas.height = Math.floor(this.h * dpr)
    this.canvas.style.width = this.w + 'px'
    this.canvas.style.height = this.h + 'px'
  }

  setTheme(t) { if (THEME_INFO[t]) this.theme = t }


  flash(color = '#fff', a = 0.7) { this.flashColor = color; this.flashA = a }

  bump(amount = 14) { this.shake = amount }

  burst(x, y, color, n = 26) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU
      const v = 80 + Math.random() * 260
      this.particles.push({ world: true, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.8 + Math.random() * 0.5, age: 0, color, size: 2 + Math.random() * 4, kind: 'spark' })
    }
  }

  confetti(n = 220) {
    const colors = ['#ff3cac', '#00e5ff', '#ffe600', '#7cff4f', '#ff8a00', '#b26bff', '#ffffff']
    for (let i = 0; i < n; i++) {
      this.particles.push({
        world: false, x: Math.random() * this.w, y: -20 - Math.random() * this.h * 0.6,
        vx: (Math.random() - 0.5) * 120, vy: 120 + Math.random() * 220, life: 6, age: 0,
        color: colors[i % colors.length], size: 5 + Math.random() * 6, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 10, kind: 'confetti',
      })
    }
  }

  react(id, e) { this.reactions.push({ id, e, age: 0, dx: (Math.random() - 0.5) * 30 }) }

  // Floating score text over a player's head ("+340  ⚡0.62s").
  popText(id, text, color = '#ffe600', big = false) {
    (this.pops ||= []).push({ id, text, color, big, age: 0 })
  }

  // --- 3D camera ------------------------------------------------------------------
  // The floor is a disc in world (x, y) with z pointing up. The camera hangs
  // above the front of the floor looking down at it at `tilt` radians, with
  // a real perspective divide, so near things are bigger and the stage
  // reads as a 3D club floor rather than a flat map.

  proj(x0, y0, z = 0) {
    // spin the floor (camera yaw) first, then tilt + perspective
    const x = x0 * this.cosY - y0 * this.sinY
    const y = x0 * this.sinY + y0 * this.cosY
    const c = this.cosT
    const s = this.sinT
    const D = this.camD
    const k = D / Math.max(D * 0.2, D - y * s - z * c)
    const v = this.view
    return { x: v.x + x * k * v.scale, y: v.y + (y * c - z * s) * k * v.scale, k: k * v.scale }
  }

  toScreen(x, y, z = 0) { return this.proj(x, y, z) }

  // Draw with the board's sway switched off: the beach stays put while the
  // board turns on its deck.
  fixedWorld(fn) {
    const c = this.cosY
    const s = this.sinY
    this.cosY = 1
    this.sinY = 0
    try { fn() } finally { this.cosY = c; this.sinY = s }
  }

  // Screen point -> spot on the floor (z = 0).
  toWorld(sx, sy) {
    const v = this.view
    const px = (sx - v.x) / v.scale
    const py = (sy - v.y) / v.scale
    const D = this.camD
    const yr = (py * D) / (D * this.cosT + py * this.sinT)
    const xr = (px * (D - yr * this.sinT)) / D
    return { x: xr * this.cosY + yr * this.sinY, y: -xr * this.sinY + yr * this.cosY }
  }

  setCamera(extent) {
    const portrait = this.w / Math.max(1, this.h) < 0.9
    const tilt = (portrait ? 0.62 : 0.8) + this.tiltBob
    this.cosY = Math.cos(this.yaw)
    this.sinY = Math.sin(this.yaw)
    this.cosT = Math.cos(tilt)
    this.sinT = Math.sin(tilt)
    this.camD = extent * 3.4
  }

  // Unit-scale bounding box of the projected board (plus head room at the back).
  footprint(E, swing = 0) {
    const c = this.cosT
    const s = this.sinT
    const D = this.camD
    const b = boardSize(E)
    const fw = frameWidth(b.hx, b.hy)
    const hx = b.hx + fw
    const hy = b.hy + fw
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (let i = 0; i < 64; i++) {
      // walk round the rectangle's edge, at every angle the board sways to
      const u = i / 64
      const side = Math.floor(u * 4)
      const f = u * 4 - side
      const bx = side === 0 ? -hx + 2 * hx * f : side === 1 ? hx : side === 2 ? hx - 2 * hx * f : -hx
      const by = side === 0 ? -hy : side === 1 ? -hy + 2 * hy * f : side === 2 ? hy : hy - 2 * hy * f
      for (const yaw of swing ? [-swing, 0, swing] : [0]) {
        const x = bx * Math.cos(yaw) - by * Math.sin(yaw)
        const y = bx * Math.sin(yaw) + by * Math.cos(yaw)
        for (const z of [-40, PERSON_HEIGHT + 20]) {
          const k = D / (D - y * s - z * c)
          const px = x * k
          const py = (y * c - z * s) * k
          x0 = Math.min(x0, px); x1 = Math.max(x1, px)
          y0 = Math.min(y0, py); y1 = Math.max(y1, py)
        }
      }
    }
    return { x0, x1, y0, y1 }
  }

  // Flat ellipse lying on the floor (a circle of radius r at height z).
  groundPath(g, x, y, r, z = 0) {
    const n = r > 120 ? 120 : 28
    g.beginPath()
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU
      const p = this.proj(x + Math.cos(a) * r, y + Math.sin(a) * r, z)
      if (i) g.lineTo(p.x, p.y)
      else g.moveTo(p.x, p.y)
    }
    g.closePath()
  }

  // A radial-gradient blob lying flat at height z (fog, spotlights, shadows).
  flatBlob(g, x, y, r, z, inner, outer) {
    const p = this.proj(x, y, z)
    g.save()
    g.translate(p.x, p.y)
    g.scale(1, this.cosT)
    const R = r * p.k
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, R)
    rg.addColorStop(0, inner)
    rg.addColorStop(1, outer)
    g.fillStyle = rg
    g.beginPath()
    g.arc(0, 0, R, 0, TAU)
    g.fill()
    g.restore()
  }

  poly(g, pts) {
    g.beginPath()
    pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)))
    g.closePath()
  }

  // --- Main frame -------------------------------------------------------------------

  draw(client, opts) {
    const { dt, pulse = 0, phaseAge = 0 } = opts
    this.time += dt

    const g = this.g
    const t = this.time
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.background(g, t, pulse)

    const state = client?.state
    const round = client?.round
    const phase = state?.phase || 'home'

    // Fit the tilted floor between the HUD bars, easing when the arena resizes.
    // Lobby: big enough that the mingling ring (radius up to ~310 + 6/player) stays on the board.
    const crowd = client?.roster ? client.roster.size : 0
    const extent = round && phase !== 'lobby' ? round.arena : (330 + crowd * 6) / 0.74
    this.extentNow = this.extentNow ? this.extentNow + (extent - this.extentNow) * Math.min(1, dt * 3) : extent
    const E = this.extentNow
    // The board holds still, square to the camera. Only the Spinning floor
    // hazard turns it, and only once the music stops; otherwise it eases back.
    // The Spinning floor sways the board to and fro (up to ~26 degrees at the
    // top level), never so far that a chair leaves the screen.
    const lv = round ? roundLevel(round) : 0
    const spinHaz = !!round?.hazards?.includes('spin')
    const swing = spinHaz ? 0.25 + 0.2 * lv : 0
    const yawTarget = phase === 'scramble' && spinHaz ? swing * Math.sin(t * 0.5) : 0
    this.yaw += (yawTarget - this.yaw) * Math.min(1, dt * 2.5)
    this.tiltBob = 0
    this.setCamera(E)
    const top = 70
    const bottom = phase === 'home' ? 0 : 84
    const availH = this.h - top - bottom
    const padL = this.padLeft || 0
    const padR = this.padRight || 0
    const availW = this.w - padL - padR - 16
    // Frame the board for the whole sway, so the camera holds steady instead
    // of zooming in and out as it turns.
    const fp = this.footprint(E, swing)
    const scale = Math.min(availW / (fp.x1 - fp.x0), availH / (fp.y1 - fp.y0))
    const sh = this.shake
    this.shake *= Math.pow(0.02, dt)
    this.view = {
      x: padL + (this.w - padL - padR) / 2 - ((fp.x0 + fp.x1) / 2) * scale + (Math.random() - 0.5) * sh,
      // sit the board low on screen so the sea and sky open up above it,
      // but never so low that a tall phone screen is mostly water
      y: Math.min(top + availH - fp.y1 * scale, top + availH / 2 - ((fp.y0 + fp.y1) / 2) * scale + this.h * 0.08) + (Math.random() - 0.5) * sh,
      scale,
    }
    this.scale = scale

    if (client && state) {
      this.fixedWorld(() => drawBeach(this, g, E, t, phase, this.theme))
      this.floor(g, E, t, pulse, phase)
      const scene = []
      // Hazards only come out once the music stops: the dance stays clear.
      const live = round && phase === 'scramble'
      const play = round && phase !== 'lobby' && phase !== 'levelup' && phase !== 'winner'
      if (play) drawGoldTiles(this, g, round, E, t)
      if (play) this.chairs(scene, client, t, phase, pulse)
      if (live) this.sceneHazards(scene, client, t, phase, E)
      this.players(scene, client, t, pulse, phase, phaseAge)
      // painter's algorithm in camera space: far first
      const depth = (it) => (it.x || 0) * this.sinY + it.y * this.cosY
      scene.sort((a, b) => depth(a) - depth(b))
      this.reflections(g, scene, E)
      for (const item of scene) item.draw(g)
      this.fixedWorld(() => drawBeachFront(this, g, E, t))
      this.worldParticles(g, dt)
      this.reactionsAndTarget(g, client, t, phase)
      if (live) this.hazards(g, client, t, phase, E)
    }
    this.screenParticles(g, dt)
    if (this.flashA > 0.01) {
      g.fillStyle = this.flashColor
      g.globalAlpha = this.flashA
      g.fillRect(0, 0, this.w, this.h)
      g.globalAlpha = 1
      this.flashA *= Math.pow(0.03, dt)
    }
  }

  // Mirror images of the people and chairs in the polished marble: drawn
  // upside down into an offscreen layer, then laid faintly over the board.
  reflections(g, scene, E) {
    const cw = this.canvas.width
    const ch = this.canvas.height
    if (!this.reflCanvas || this.reflCanvas.width !== cw || this.reflCanvas.height !== ch) {
      this.reflCanvas = document.createElement('canvas')
      this.reflCanvas.width = cw
      this.reflCanvas.height = ch
    }
    const rc = this.reflCanvas
    const rg = rc.getContext('2d')
    rg.setTransform(1, 0, 0, 1, 0, 0)
    rg.clearRect(0, 0, cw, ch)
    rg.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    let any = false
    for (const item of scene) {
      if (!item.reflect) continue
      rg.save()
      item.reflect(rg)
      rg.restore()
      any = true
    }
    if (!any) return
    const { hx, hy } = boardSize(E)
    g.save()
    this.poly(g, [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map(([x, y]) => this.proj(x, y, 0)))
    g.clip()
    g.globalAlpha = 0.22
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.drawImage(rc, 0, 0)
    g.restore()
  }

  // --- Backgrounds --------------------------------------------------------------------

  background(g, t, pulse) {
    drawSky(this, g, t, this.theme)
  }

  // --- The floor: a big raised checkerboard -------------------------------------------

  floor(g, E, t, pulse, phase) {
    const { hx, hy } = boardSize(E)
    const H = 6 // a marble slab sitting on the wooden deck
    const fw = frameWidth(hx, hy)
    const C = [[-hx - fw, -hy - fw], [hx + fw, -hy - fw], [hx + fw, hy + fw], [-hx - fw, hy + fw]]
    // Stage side walls facing the camera: dark lacquer with a gold trim.
    const normals = [[0, -1], [1, 0], [0, 1], [-1, 0]]
    for (let e = 0; e < 4; e++) {
      const [nx, ny] = normals[e]
      if (nx * this.sinY + ny * this.cosY <= 0) continue
      const [ax, ay] = C[e]
      const [bx, by] = C[(e + 1) % 4]
      const pts = [this.proj(ax, ay, 0), this.proj(bx, by, 0), this.proj(bx, by, -H), this.proj(ax, ay, -H)]
      const sg = g.createLinearGradient(0, Math.min(pts[0].y, pts[1].y), 0, Math.max(pts[2].y, pts[3].y))
      sg.addColorStop(0, '#2a1810')
      sg.addColorStop(1, '#0d0705')
      g.fillStyle = sg
      this.poly(g, pts)
      g.fill()
      g.strokeStyle = '#c9a43a'
      g.lineWidth = 1.5
      g.beginPath()
      g.moveTo(pts[3].x, pts[3].y)
      g.lineTo(pts[2].x, pts[2].y)
      g.stroke()
    }
    drawBoardTop(this, g, E, t, phase)
  }

  // --- Chairs (solid 3D: legs, padded seat, backrest) ---------------------------------

  chairs(scene, client, t, phase, pulse) {
    const th = THEME_INFO[this.theme]
    const round = client.round
    const hostT = client.hostNow()
    const pts = client.chairPoints(hostT)
    const owners = client.state.owners
    const scramble = phase === 'scramble'
    const wild = round.motion === 'wild'
    const since = (hostT - round.musicAt) / 1000
    const lv = roundLevel(round)
    pts.forEach((c, i) => {
      const taken = !!owners[i]
      // Wild chairs blink out of sight once the music stops (never during the dance).
      const blink = levelOf(round).blink
      // Special chairs never blink: they're the prizes everyone can see.
      const throne = round.thrones?.includes(i) ? 'throne' : round.silvers?.includes(i) ? 'silver' : false
      const vis = wild && !taken && scramble && blink && !throne ? Math.max(0.04, chairVisibility(round.seed, i, since, blink)) : 1
      scene.push({
        x: c.x, y: c.y,
        draw: (g) => this.drawChair(g, c, i, t, pulse, th, taken, scramble && !taken, vis, throne),
        reflect: (g) => { this.mirror = true; this.drawChair(g, c, i, t, pulse, th, taken, false, vis, throne); this.mirror = false },
      })
    })
    // The round table everyone who sits ends up at (fades in after the stop).
    if (round.stopAt && (phase === 'scramble' || phase === 'result')) {
      const fade = Math.min(1, Math.max(0, (hostT - round.stopAt) / 900))
      if (fade > 0) {
        const tb = roundTable(round)
        scene.push({ x: 0, y: 0, draw: (g) => this.drawTable(g, tb.top, fade) })
      }
    }
    // Decoy "mirage" chairs during the scramble: they look free, but aren't real.
    if (scramble && round.hazards?.includes('mirage')) {
      for (const d of this.decoys(round, hostT)) {
        scene.push({ x: d.x, y: d.y, draw: (g) => this.drawChair(g, d, d.i + 100, t, pulse, th, false, true, d.vis) })
      }
    }
  }

  decoys(round, hostT) {
    if (this.decoyFor !== round.seed) {
      this.decoyFor = round.seed
      const n = Math.max(2, Math.ceil(round.chairs.length * 0.7) + Math.round(roundLevel(round) * 4))
      const seed = (round.seed ^ 0xdec0) >>> 0
      this.decoyRound = { ...round, seed, chairs: chairLayout('scatter', n, seed), seats: null }
    }
    const dr = { ...this.decoyRound, musicAt: round.musicAt, stopAt: round.stopAt, arena: round.arena }
    const since = (hostT - round.musicAt) / 1000
    const sinceStop = round.stopAt ? (hostT - round.stopAt) / 1000 : 0
    return dr.chairs.map((_, i) => {
      const p = chairPosAt(dr, i, hostT)
      // fade in just after the stop, then flicker like a mirage
      const intro = Math.min(1, Math.max(0, (sinceStop - 0.3) / 0.4))
      return { ...p, i, vis: intro * Math.max(0.04, chairVisibility(dr.seed, i, since + 1.3, 0.5)) }
    })
  }

  // A round table with a white cloth, on a dark pedestal, with a little
  // flower centrepiece. Seated players' chairs gather round it.
  drawTable(g, R, alpha) {
    const H = 46
    g.save()
    g.globalAlpha = alpha
    this.flatBlob(g, 0, 0, R * 1.15, 0, 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0)')
    // pedestal
    const foot = this.proj(0, 0, 0)
    const neck = this.proj(0, 0, H - 4)
    const k = foot.k
    g.fillStyle = '#2b1d14'
    g.save()
    g.translate(foot.x, foot.y)
    g.scale(1, this.cosT)
    g.beginPath()
    g.arc(0, 0, Math.min(R * 0.35, 40) * k, 0, TAU)
    g.fill()
    g.restore()
    g.strokeStyle = '#3a2819'
    g.lineWidth = Math.max(4, 12 * k)
    g.beginPath()
    g.moveTo(foot.x, foot.y)
    g.lineTo(neck.x, neck.y)
    g.stroke()
    // tablecloth: the hanging skirt, then the top
    const rim = []
    const low = []
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI - this.yaw
      rim.push(this.proj(Math.cos(a) * R, Math.sin(a) * R, H))
      low.push(this.proj(Math.cos(a) * R * 1.02, Math.sin(a) * R * 1.02, H - 14))
    }
    g.fillStyle = '#d9d4ca'
    this.poly(g, [...rim, ...low.reverse()])
    g.fill()
    const c = this.proj(0, 0, H)
    const tg = g.createRadialGradient(c.x, c.y - R * c.k * 0.3, 0, c.x, c.y, R * c.k * 1.1)
    tg.addColorStop(0, '#ffffff')
    tg.addColorStop(1, '#e6e1d6')
    g.fillStyle = tg
    this.groundPath(g, 0, 0, R, H)
    g.fill()
    g.strokeStyle = 'rgba(120,100,80,0.35)'
    g.lineWidth = 1.5
    g.stroke()
    // centrepiece: a small vase of flowers
    const v0 = this.proj(0, 0, H)
    const v1 = this.proj(0, 0, H + 22)
    const vk = v0.k
    g.fillStyle = '#5a7fb0'
    roundRect(g, v0.x - 6 * vk, v1.y + 8 * vk, 12 * vk, v0.y - v1.y - 8 * vk, 4 * vk)
    g.fill()
    const petals = ['#ff6b8a', '#ffd166', '#ff9f5a', '#c77dff', '#ff6b8a']
    petals.forEach((col, i) => {
      const a = -Math.PI / 2 + (i - 2) * 0.45
      const fx = v1.x + Math.cos(a) * 10 * vk
      const fy = v1.y + Math.sin(a) * 8 * vk
      g.strokeStyle = '#3f7d3a'
      g.lineWidth = Math.max(1, 1.5 * vk)
      g.beginPath()
      g.moveTo(v1.x, v1.y + 10 * vk)
      g.lineTo(fx, fy)
      g.stroke()
      g.fillStyle = col
      g.beginPath()
      g.arc(fx, fy, 4.5 * vk, 0, TAU)
      g.fill()
    })
    g.restore()
  }

  // A real wooden chair standing on the floor: four legs, a seat with some
  // thickness, and a slatted backrest on two tall back posts.
  // A throne is the same chair in gilded wood with a purple cushion, a tall
  // back and a crown on top. A silver chair is polished silver with a blue
  // cushion and a slightly taller back. `kind`: 'throne' | 'silver' | false.
  drawChair(g, c, i, t, pulse, th, taken, free, vis, kind = false) {
    const throne = kind === 'throne'
    const silver = kind === 'silver'
    if (vis <= 0.01) return
    g.save()
    g.globalAlpha = vis
    const s = CHAIR_RADIUS * 1.15
    const H = 33
    const BH = throne ? 64 : silver ? 54 : 46
    const cs = Math.cos(c.face)
    const sn = Math.sin(c.face)
    const zf = this.mirror ? -1 : 1 // reflections hang upside down below the floor
    const W = (lx, ly, z) => this.proj(c.x + lx * cs - ly * sn, c.y + lx * sn + ly * cs, z * zf)
    const k = this.proj(c.x, c.y, H).k
    // red-painted wood: stands out on both the brown and the cream squares
    const wood = throne ? '#d4a52a' : silver ? '#b8c2cc' : '#c62828'
    const woodLight = throne ? '#ffe27a' : silver ? '#f2f6fa' : '#ef5350'
    const woodDark = throne ? '#8a6414' : silver ? '#5d6873' : '#7f1414'
    // contact shadow on the floor, plus "free chair" ring during the scramble
    if (!this.mirror) this.flatBlob(g, c.x, c.y, s * 1.7, 0, 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0)')
    if (kind && !this.mirror && !taken) {
      // a glow under every free special chair, so you can spot them from afar
      const q = 0.5 + 0.5 * Math.sin(t * 4 + i)
      const glow = throne ? '255,215,90' : '210,230,255'
      this.flatBlob(g, c.x, c.y, s * ((throne ? 2.3 : 1.9) + 0.3 * q), 0.5, `rgba(${glow},${throne ? 0.55 : 0.45})`, `rgba(${glow},0)`)
    }
    if (free) {
      const q = 0.5 + 0.5 * Math.sin(t * 6 + i)
      g.strokeStyle = throne ? `rgba(190,120,255,${0.65 + 0.35 * q})` : silver ? `rgba(120,200,255,${0.6 + 0.35 * q})` : `rgba(255,200,40,${0.55 + 0.35 * q})`
      g.lineWidth = 3
      this.groundPath(g, c.x, c.y, s * 1.45 + q * 4)
      g.stroke()
    }
    const fr = c.face + this.yaw
    const vsn = Math.sin(fr)
    const vcs = Math.cos(fr)
    const backBehind = -vsn < 0
    g.lineCap = 'round'
    const leg = (lx, ly, z1, w = 3.4) => {
      const a = W(lx, ly, 0)
      const b = W(lx, ly, z1)
      g.strokeStyle = woodDark
      g.lineWidth = Math.max(1.5, w * k)
      g.beginPath()
      g.moveTo(a.x, a.y)
      g.lineTo(b.x, b.y)
      g.stroke()
      // tiny foot shadow so it reads as standing on the floor
      if (this.mirror) return
      g.fillStyle = 'rgba(0,0,0,0.35)'
      g.beginPath()
      g.ellipse(a.x, a.y, 2.6 * k, 1.3 * k, 0, 0, TAU)
      g.fill()
    }
    const backrest = () => {
      const p = 0.88
      leg(-s * p, -s * p, H + BH, 3.8)
      leg(-s * p, s * p, H + BH, 3.8)
      // top rail and two slats
      for (const [z0, z1, col] of [[H + BH - 11, H + BH, woodLight], [H + 11, H + 16, wood], [H + 22, H + 27, wood]]) {
        g.fillStyle = col
        this.poly(g, [W(-s * p, -s * p, z0), W(-s * p, s * p, z0), W(-s * p, s * p, z1), W(-s * p, -s * p, z1)])
        g.fill()
        g.strokeStyle = 'rgba(40,20,8,0.5)'
        g.lineWidth = 1
        g.stroke()
      }
    }
    if (backBehind) backrest()
    // legs (back legs are the backrest posts)
    leg(s * 0.88, -s * 0.88, H - 3)
    leg(s * 0.88, s * 0.88, H - 3)
    if (!backBehind) { leg(-s * 0.88, -s * 0.88, H - 3); leg(-s * 0.88, s * 0.88, H - 3) }
    // seat: visible edges, then the top
    const T = 4
    const faces = [
      { a: [s, -s], b: [s, s], ny: vsn }, { a: [-s, s], b: [-s, -s], ny: -vsn },
      { a: [s, s], b: [-s, s], ny: vcs }, { a: [-s, -s], b: [s, -s], ny: -vcs },
    ]
    g.fillStyle = woodDark
    for (const f of faces) {
      if (f.ny <= 0) continue
      this.poly(g, [W(f.a[0], f.a[1], H), W(f.b[0], f.b[1], H), W(f.b[0], f.b[1], H - T), W(f.a[0], f.a[1], H - T)])
      g.fill()
    }
    const top = [W(-s, -s, H), W(s, -s, H), W(s, s, H), W(-s, s, H)]
    const grad = g.createLinearGradient(top[0].x, top[0].y, top[2].x, top[2].y)
    grad.addColorStop(0, woodLight)
    grad.addColorStop(0.6, wood)
    grad.addColorStop(1, throne ? '#a87b16' : silver ? '#8793a0' : '#a31f1f')
    g.fillStyle = grad
    this.poly(g, top)
    g.fill()
    if (kind) {
      // velvet cushion: purple on a throne, royal blue on a silver chair
      g.fillStyle = throne ? '#7b2fbf' : '#2f6fd6'
      this.poly(g, [W(-s * 0.72, -s * 0.72, H + 1.5), W(s * 0.72, -s * 0.72, H + 1.5), W(s * 0.72, s * 0.72, H + 1.5), W(-s * 0.72, s * 0.72, H + 1.5)])
      g.fill()
    }
    // wood grain
    g.strokeStyle = silver ? 'rgba(40,50,60,0.2)' : 'rgba(90,10,10,0.25)'
    g.lineWidth = 1
    for (const f of [-0.5, 0, 0.5]) {
      const a = W(-s * 0.9, s * f, H + 0.3)
      const b = W(s * 0.9, s * f + 1.5, H + 0.3)
      g.beginPath()
      g.moveTo(a.x, a.y)
      g.lineTo(b.x, b.y)
      g.stroke()
    }
    if (!backBehind) backrest()
    if (throne) {
      // the crown on top of the back
      const cp = W(-s * 0.88, 0, H + BH + 2)
      const ck = cp.k
      const cw = 16 * ck
      const chh = 13 * ck
      g.fillStyle = '#ffd54a'
      g.strokeStyle = '#7a5208'
      g.lineWidth = Math.max(1, 1.2 * ck)
      g.beginPath()
      g.moveTo(cp.x - cw, cp.y)
      g.lineTo(cp.x - cw, cp.y - chh)
      g.lineTo(cp.x - cw * 0.5, cp.y - chh * 0.45)
      g.lineTo(cp.x, cp.y - chh * 1.15)
      g.lineTo(cp.x + cw * 0.5, cp.y - chh * 0.45)
      g.lineTo(cp.x + cw, cp.y - chh)
      g.lineTo(cp.x + cw, cp.y)
      g.closePath()
      g.fill()
      g.stroke()
      g.fillStyle = '#e0245e'
      g.beginPath()
      g.arc(cp.x, cp.y - chh * 0.35, 2.4 * ck, 0, TAU)
      g.fill()
      if (!this.mirror && !taken) {
        // sparkle
        const q = (t * 1.3 + i * 0.37) % 1
        g.globalAlpha = vis * Math.sin(q * Math.PI)
        g.fillStyle = '#fffbe0'
        const sx = cp.x + (q - 0.5) * cw * 2
        const sy = cp.y - chh * 1.4
        g.beginPath()
        g.moveTo(sx, sy - 5 * ck); g.lineTo(sx + 1.4 * ck, sy); g.lineTo(sx, sy + 5 * ck); g.lineTo(sx - 1.4 * ck, sy)
        g.closePath()
        g.fill()
      }
    }
    g.restore()
  }

  // --- Players: real people standing on the floor ---------------------------------

  players(scene, client, t, pulse, phase, phaseAge) {
    const pos = client.positions()
    const me = client.me
    this.lastPos = pos
    const dt = Math.max(1 / 240, Math.min(0.1, t - (this.lastPlayersT ?? t - 1 / 60)))
    this.lastPlayersT = t
    for (const [id, p] of pos) {
      const info = client.roster.get(id)
      if (!info) continue
      let { x, y } = p
      // Walk cycle from how fast this person is actually moving.
      let gt = this.gait.get(id)
      if (!gt) { gt = { x, y, ph: hash(id) * TAU, speed: 0, vx: 0 }; this.gait.set(id, gt) }
      const step = Math.hypot(x - gt.x, y - gt.y)
      const speed = step > 200 ? 0 : step / dt
      gt.speed += (speed - gt.speed) * Math.min(1, dt * 10)
      gt.vx += (((x - gt.x) / dt) - gt.vx) * Math.min(1, dt * 8)
      gt.ph += Math.min(step, 40) / 11
      gt.x = x
      gt.y = y
      let z = 0
      let scale = 1
      let rot = 0
      let alpha = 1
      let boot = null
      if (p.mode === 'booted' && phase === 'result') {
        // Kicked off the board: launched outward and up, spinning.
        const e = phaseAge
        const d = Math.hypot(x, y) || 1
        const ux = x / d
        const uy = y / d
        const fly = Math.max(0, e - 0.35)
        x += ux * fly * 900
        y += uy * fly * 900
        z = Math.sin(Math.min(fly, 1) * Math.PI) * 220 + fly * 60
        rot = fly * 10
        scale = Math.max(0.3, 1 - fly * 0.4)
        alpha = Math.max(0, 1 - fly * 0.7)
        if (e < 0.6) boot = { e, ux, uy, px: p.x, py: p.y }
        if (alpha <= 0) continue
      }
      const seated = p.mode === 'seated'
      const champ = p.mode === 'champ'
      const dancing = (phase === 'music' || phase === 'levelup') && (p.mode === 'dance' || p.mode === 'idle')
      if (champ) scale *= 2.2
      const stride = seated || champ ? 0 : Math.min(1, gt.speed / 160)
      const pose = {
        walk: gt.ph,
        stride,
        seated,
        arms: champ ? 'up' : dancing ? 'dance' : 'swing',
        beat: t * 4 + hash(id) * 6,
        lean: seated ? 0 : Math.max(-1, Math.min(1, gt.vx / 300)),
      }
      const depthY = seated ? y + 0.5 : y
      const reflect = z > 2 ? null : (g) => {
        const foot = this.proj(x, y, 0)
        const head = this.proj(x, y, PERSON_HEIGHT * scale)
        g.globalAlpha = alpha
        g.translate(foot.x, foot.y)
        g.scale(1, -1)
        drawPerson(g, info.avatar, 0, 0, Math.max(6, foot.y - head.y), pose)
      }
      scene.push({ x, y: depthY, reflect, draw: (g) => {
        g.save()
        g.globalAlpha = alpha
        if (boot) {
          const kk = boot.e < 0.35 ? Math.sin((boot.e / 0.35) * Math.PI) * 18 : 0
          const bp = this.proj(boot.px - boot.ux * (46 - kk), boot.py - boot.uy * (46 - kk), 20)
          g.font = `${Math.round(44 * bp.k)}px "Apple Color Emoji","Segoe UI Emoji",sans-serif`
          g.textAlign = 'center'
          g.textBaseline = 'middle'
          g.fillText('🥾', bp.x, bp.y)
        }
        // shadow + a ring in the player's colour on the floor under their feet
        if (!seated) {
          const sa = Math.max(0.1, 0.45 - z / 400)
          this.flatBlob(g, x, y, PLAYER_RADIUS * 1.5 * scale, 0, `rgba(0,0,0,${sa})`, 'rgba(0,0,0,0)')
          if (z < 5) {
            g.strokeStyle = info.color
            g.lineWidth = 3
            this.groundPath(g, x, y, PLAYER_RADIUS * 1.25 * scale)
            g.stroke()
          }
          if (id === me && phase !== 'lobby' && z < 5) {
            g.strokeStyle = '#ffffff'
            g.lineWidth = 2
            g.setLineDash([6, 5])
            g.lineDashOffset = t * 20
            this.groundPath(g, x, y, PLAYER_RADIUS * 1.7 * scale)
            g.stroke()
            g.setLineDash([])
          }
        }
        const foot = this.proj(x, y, z)
        const head = this.proj(x, y, z + PERSON_HEIGHT * scale)
        const hpx = Math.max(6, foot.y - head.y)
        if (rot) {
          const cy = (foot.y + head.y) / 2
          g.translate(foot.x, cy)
          g.rotate(rot)
          g.translate(-foot.x, -cy)
        }
        drawPerson(g, info.avatar, foot.x, foot.y, hpx, pose)
        if (rot) g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
        // name tag over the head
        const topY = foot.y - hpx * (seated ? 0.78 : 1.02)
        const fs = Math.max(9, Math.round(12 * Math.min(1.4, foot.k)))
        g.font = `700 ${fs}px Outfit, system-ui, sans-serif`
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        const label = id === me ? `${info.name} (you)` : info.name
        const tw = g.measureText(label).width + 12
        g.fillStyle = 'rgba(8,0,20,0.72)'
        roundRect(g, foot.x - tw / 2, topY - fs - 7, tw, fs + 5, 8)
        g.fill()
        g.fillStyle = info.color
        g.fillRect(foot.x - tw / 2 + 4, topY - 4, tw - 8, 2)
        g.fillStyle = '#ffffff'
        g.fillText(label, foot.x, topY - fs / 2 - 4.5)
        if (id === me && !seated && !champ && phase !== 'lobby') {
          g.fillStyle = '#ffe600'
          g.font = '800 13px Outfit, system-ui, sans-serif'
          g.fillText('▼ YOU', foot.x, topY - fs - 18 + Math.sin(t * 4) * 2)
        }
        if (p.mode === 'booted' && phase === 'result' && phaseAge < 2.2) {
          g.font = '900 20px Bungee, Impact, sans-serif'
          g.fillStyle = '#ff3c5a'
          g.fillText('BOOTED!', foot.x, topY - fs - 22)
        }
        if (champ) {
          g.font = `${Math.round(hpx * 0.18)}px "Apple Color Emoji","Segoe UI Emoji",sans-serif`
          g.fillText('👑', foot.x, topY - fs - 10 - hpx * 0.08 + Math.sin(t * 3) * 3)
        }
        g.restore()
      } })
    }
    if (this.gait.size > pos.size * 2 + 20) {
      for (const id of this.gait.keys()) if (!pos.has(id)) this.gait.delete(id)
    }
  }

  reactionsAndTarget(g, client, t, phase) {
    const pos = this.lastPos
    for (const rc of this.reactions) {
      const p = pos?.get(rc.id)
      if (!p) continue
      const u = rc.age / 1.8
      const P = this.proj(p.x + rc.dx * u, p.y, PERSON_HEIGHT + 30 + u * 80)
      g.globalAlpha = Math.max(0, 1 - u)
      g.font = `${Math.round(28 * Math.min(1.6, P.k))}px "Apple Color Emoji","Segoe UI Emoji",sans-serif`
      g.textAlign = 'center'
      g.fillText(rc.e, P.x, P.y)
      g.globalAlpha = 1
    }
    this.drawPops(g, pos)
    if (phase !== 'scramble') { this.fx = []; return }
    // Click feedback: a ripple where you clicked on the floor, and a marker
    // on the spot you're running to.
    this.fx = (this.fx || []).filter((f) => (f.age += 1 / 60) < 0.6)
    for (const f of this.fx) {
      const u = f.age / 0.6
      g.strokeStyle = `rgba(255,255,255,${0.9 * (1 - u)})`
      g.lineWidth = 4 * (1 - u) + 1
      this.groundPath(g, f.x, f.y, 12 + u * 50)
      g.stroke()
    }
    const target = client.input?.target
    if (!target || target.chair != null || !client.self) return
    g.strokeStyle = 'rgba(255,255,255,0.8)'
    g.lineWidth = 2
    this.groundPath(g, target.x, target.y, 12 + Math.sin(t * 10) * 3)
    g.stroke()
  }

  drawPops(g, pos) {
    if (!this.pops?.length) return
    this.pops = this.pops.filter((p) => (p.age += 1 / 60) < 2.2)
    for (const p of this.pops) {
      const at = pos?.get(p.id)
      if (!at) continue
      const u = p.age / 2.2
      const P = this.proj(at.x, at.y, PERSON_HEIGHT + 40 + u * 90)
      const pop = Math.min(1, p.age / 0.15)
      const size = Math.round((p.big ? 30 : 18) * (0.6 + 0.4 * pop))
      g.save()
      g.globalAlpha = Math.min(1, (1 - u) * 2.5)
      g.font = `900 ${size}px Bungee, Impact, sans-serif`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.lineWidth = p.big ? 6 : 4
      g.strokeStyle = 'rgba(20,10,40,0.85)'
      g.strokeText(p.text, P.x, P.y)
      g.fillStyle = p.color
      g.fillText(p.text, P.x, P.y)
      g.restore()
    }
  }

  spotFx(p) { (this.fx ||= []).push({ x: p.x, y: p.y, age: 0 }) }

  // Which free chair is under this screen point? Tests the chair's whole
  // picture (it stands up off the floor), nearest first. -1 if none.
  pickChair(sx, sy, client, slack = 1.25) {
    const owners = client.state?.owners || []
    const pts = client.chairPoints()
    let best = -1
    let bd = Infinity
    pts.forEach((c, i) => {
      if (owners[i]) return
      for (const z of [8, 30, 55]) {
        const P = this.proj(c.x, c.y, z)
        const rad = CHAIR_RADIUS * 1.5 * P.k * slack
        const d = Math.hypot(sx - P.x, sy - P.y) / rad
        if (d < 1 && d < bd) { bd = d; best = i }
      }
    })
    return best
  }

  // --- Hazards -----------------------------------------------------------------------------
  // Each round draws a random mix from the hazard pool (more of them as fewer
  // players remain). Solid ones (disco balls, bouncers, speakers) are depth-
  // sorted into the scene; the rest are drawn OVER everything so the chairs
  // are hard to pick out. Only the bouncers physically block you; the rest
  // are visual, so a click always goes through.

  // Solid 3D hazards that live in the depth-sorted scene.
  sceneHazards(scene, client, t, phase, E) {
    const round = client.round
    const hz = round.hazards || []
    const lv = roundLevel(round)
    const hostT = client.hostNow()
    if (hz.includes('balls')) {
      const n = 2 + Math.round(lv * 3)
      for (let i = 0; i < n; i++) {
        const base = { x: Math.cos(i * 2.4) * E * 0.4, y: Math.sin(i * 2.4) * E * 0.4, face: 0 }
        const p = roamPos((round.seed ^ 0xba11) >>> 0, i, base, t * (phase === 'scramble' ? 1.6 : 0.8), E, 170, 0)
        const R = 46 + (i % 3) * 12
        const z = Math.abs(Math.sin(t * (2 + i * 0.3) + i)) * (90 + 60 * lv)
        scene.push({ x: p.x, y: p.y, draw: (g) => this.discoBall(g, p.x, p.y, z, R, t, i) })
      }
    }
    if (hz.includes('bouncers')) {
      bouncers(round, hostT).forEach((b, i) => {
        scene.push({ x: b.x, y: b.y, draw: (g) => this.bouncer(g, b.x, b.y, t, i) })
      })
    }
  }

  hazards(g, client, t, phase, E) {
    const round = client.round
    const hz = round.hazards || []
    const lv = roundLevel(round)
    const scramble = phase === 'scramble'
    const seed = round.seed
    const heat = scramble ? 1 : 0.45 // everything ramps up once the music stops
    if (hz.includes('smoke')) this.smoke(g, t, E, seed, heat, lv)
    if (hz.includes('lasers')) this.laserWalls(g, t, E, heat, lv)
    if (hz.includes('fog')) this.fog(g, t, E, seed, heat, lv)
    if (hz.includes('balloons')) this.balloons(g, t, E, seed, heat, lv)
    if (hz.includes('birds')) this.birds(g, t, E, heat, lv)
    if (hz.includes('confetti') && scramble) this.confettiStorm(lv)
    if (hz.includes('darkness')) this.darkness(g, t, E, heat, lv)
    if (hz.includes('blackout') && scramble) {
      const win = 2.2 * (1 - 0.4 * lv)
      const n = Math.floor(t / win)
      const st = 0.3 + hash('bo' + seed + n) * (win - 0.8)
      const len = 0.3 * (1 + 0.6 * lv)
      const u = t - n * win - st
      if (u > 0 && u < len) {
        g.fillStyle = `rgba(0,0,0,${0.92 * Math.sin((u / len) * Math.PI) ** 0.4})`
        g.fillRect(0, 0, this.w, this.h)
      }
    }
  }

  fog(g, t, E, seed, heat, lv) {
    const fogN = Math.round(4 + heat * (4 + lv * 5))
    const tint = this.theme === 'sunset' ? '255,200,230' : this.theme === 'cosmic' ? '200,210,255' : '235,215,255'
    for (let i = 0; i < fogN; i++) {
      const ph = hash('fog' + seed + i) * TAU
      const sp = (0.05 + heat * 0.12) * (1 + i * 0.13)
      const x = Math.sin(t * sp + ph) * E * 0.85
      const y = Math.cos(t * sp * 0.8 + ph * 1.7) * E * 0.75
      const r = E * (0.2 + 0.08 * Math.sin(t * 0.4 + i))
      const a = (0.35 + heat * (0.4 + 0.15 * lv)) * (0.75 + 0.25 * Math.sin(t * 0.6 + i * 2))
      this.flatBlob(g, x, y, r, 30, `rgba(${tint},${a})`, `rgba(${tint},0)`)
      this.flatBlob(g, x + r * 0.4, y - r * 0.2, r * 0.7, 45, `rgba(${tint},${a * 0.6})`, `rgba(${tint},0)`)
    }
  }

  birds(g, t, E, heat, lv) {
    const period = 5 - heat * (2.4 + lv * 1.2)
    const flocks = heat === 1 ? 2 + Math.round(lv * 2) : 2
    for (let f = 0; f < flocks; f++) {
      const tt = t + (f * period) / flocks
      const cyc = Math.floor(tt / period)
      const u = (tt - cyc * period) / period
      const ang = hash('bird' + f + ':' + cyc) * TAU
      const off = (hash('birdb' + f + ':' + cyc) - 0.5) * E
      const dirx = Math.cos(ang)
      const diry = Math.sin(ang)
      const travel = (u * 2 - 1) * E * 1.5
      const cx = dirx * travel - diry * off
      const cy = diry * travel + dirx * off
      const count = 6 + Math.round(heat * (3 + lv * 4))
      for (let j = 0; j < count; j++) {
        const row = Math.ceil(j / 2)
        const side = j % 2 ? 1 : -1
        const bx = cx - dirx * row * 34 - diry * side * row * 30
        const by = cy - diry * row * 34 + dirx * side * row * 30
        if (Math.hypot(bx, by) > E * 1.4) continue
        const bz = 45 + Math.sin(u * TAU * 2 + j) * 14
        this.flatBlob(g, bx, by, 16, 0, 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0)')
        this.bird(g, bx, by, bz, ang, t * 13 + j * 1.7, f % 2)
      }
    }
  }

  // Giant mirror-tiled balls bouncing across the floor.
  discoBall(g, x, y, z, R, t, i) {
    const shadowA = Math.max(0.15, 0.55 - z / 400)
    this.flatBlob(g, x, y, R * 1.2, 0, `rgba(0,0,0,${shadowA})`, 'rgba(0,0,0,0)')
    const P = this.proj(x, y, z + R)
    const r = R * P.k
    g.save()
    g.translate(P.x, P.y)
    g.beginPath()
    g.arc(0, 0, r, 0, TAU)
    g.clip()
    const base = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r)
    base.addColorStop(0, '#ffffff')
    base.addColorStop(0.5, '#9aa0b8')
    base.addColorStop(1, '#2a2440')
    g.fillStyle = base
    g.fillRect(-r, -r, r * 2, r * 2)
    // mirror tiles that sparkle as it spins
    const n = 8
    const cell = (r * 2) / n
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        const tw = Math.sin(t * 6 + a * 1.7 + b * 2.3 + i)
        if (tw < 0.4) continue
        g.fillStyle = `hsla(${(a * 40 + b * 25 + t * 90) % 360},100%,75%,${(tw - 0.4) * 0.9})`
        g.fillRect(-r + a * cell + 1, -r + b * cell + 1, cell - 2, cell - 2)
      }
    }
    g.restore()
    g.save()
    g.strokeStyle = 'rgba(255,255,255,0.4)'
    g.lineWidth = 1.5
    g.beginPath()
    g.arc(P.x, P.y, r, 0, TAU)
    g.stroke()
    g.restore()
  }

  // Security: tall dark figures in shades who wander about and body-block you.
  bouncer(g, x, y, t, i) {
    this.flatBlob(g, x, y, BOUNCER_RADIUS * 1.5, 0, 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0)')
    const foot = this.proj(x, y, 0)
    const sh = this.proj(x, y, 78)
    const hd = this.proj(x, y, 98)
    const k = sh.k
    const w = BOUNCER_RADIUS * 1.7 * k
    const sway = Math.sin(t * 2 + i) * 2 * k
    g.save()
    // legs
    g.fillStyle = '#0b0b12'
    roundRect(g, foot.x - w * 0.32 + sway, sh.y + (foot.y - sh.y) * 0.45, w * 0.26, (foot.y - sh.y) * 0.55, 4 * k)
    g.fill()
    roundRect(g, foot.x + w * 0.06 + sway, sh.y + (foot.y - sh.y) * 0.45, w * 0.26, (foot.y - sh.y) * 0.55, 4 * k)
    g.fill()
    // torso
    const tg = g.createLinearGradient(sh.x - w / 2, 0, sh.x + w / 2, 0)
    tg.addColorStop(0, '#111118')
    tg.addColorStop(0.5, '#2b2b3a')
    tg.addColorStop(1, '#0c0c12')
    g.fillStyle = tg
    roundRect(g, sh.x - w / 2, sh.y - 4 * k, w, (foot.y - sh.y) * 0.55, 12 * k)
    g.fill()
    g.fillStyle = '#ffe600'
    g.font = `900 ${Math.max(7, Math.round(9 * k))}px Bungee, Impact, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('SECURITY', sh.x, sh.y + (foot.y - sh.y) * 0.2)
    // head + shades
    const hr = 13 * k
    g.fillStyle = '#3a2a22'
    g.beginPath()
    g.arc(hd.x, hd.y, hr, 0, TAU)
    g.fill()
    g.fillStyle = '#000'
    roundRect(g, hd.x - hr * 0.85, hd.y - hr * 0.2, hr * 1.7, hr * 0.45, 2)
    g.fill()
    g.fillStyle = 'rgba(0,229,255,0.8)'
    g.fillRect(hd.x - hr * 0.6, hd.y - hr * 0.12, hr * 0.3, hr * 0.1)
    g.restore()
  }

  // Bunches of balloons drifting up off the floor, straight past the camera.
  balloons(g, t, E, seed, heat, lv) {
    const n = Math.round(6 + heat * (8 + lv * 14))
    const colors = ['#ff3cac', '#00e5ff', '#ffe600', '#7cff4f', '#ff8a00', '#b26bff', '#ff4f6d']
    for (let i = 0; i < n; i++) {
      const period = 5 + hash('blp' + i) * 3
      const tt = t + hash('blo' + i) * period
      const cyc = Math.floor(tt / period)
      const u = (tt - cyc * period) / period
      const r0 = Math.sqrt(hash('blr' + seed + i + ':' + cyc)) * E * 0.95
      const a0 = hash('bla' + seed + i + ':' + cyc) * TAU
      const x = Math.cos(a0) * r0 + Math.sin(t + i) * 12
      const y = Math.sin(a0) * r0
      const z = -20 + u * 420
      const P = this.proj(x, y, z)
      const B = this.proj(x, y, z - 50)
      const rr = 20 * P.k
      g.save()
      g.globalAlpha = Math.min(1, (1 - u) * 3, u * 8)
      g.strokeStyle = 'rgba(255,255,255,0.5)'
      g.lineWidth = 1
      g.beginPath()
      g.moveTo(P.x, P.y + rr * 1.2)
      g.quadraticCurveTo(P.x + 6, (P.y + B.y) / 2, B.x, B.y)
      g.stroke()
      const col = colors[i % colors.length]
      const bg = g.createRadialGradient(P.x - rr * 0.35, P.y - rr * 0.45, rr * 0.1, P.x, P.y, rr * 1.2)
      bg.addColorStop(0, '#ffffff')
      bg.addColorStop(0.25, col)
      bg.addColorStop(1, 'rgba(0,0,0,0.6)')
      g.fillStyle = bg
      g.beginPath()
      g.ellipse(P.x, P.y, rr, rr * 1.2, 0, 0, TAU)
      g.fill()
      g.restore()
    }
  }

  // Sweeping walls of laser light, each a sheet of glowing beams.
  laserWalls(g, t, E, heat, lv) {
    const n = 1 + Math.round(heat * (1 + lv * 2))
    g.save()
    g.globalCompositeOperation = 'lighter'
    for (let i = 0; i < n; i++) {
      const ang = t * (0.35 + heat * 0.5) * (i % 2 ? -1 : 1) + i * 1.3
      const off = Math.sin(t * 0.7 + i * 2) * E * 0.55
      const dx = Math.cos(ang)
      const dy = Math.sin(ang)
      const L = Math.sqrt(Math.max(0, E * E - off * off))
      const ax = -dy * off - dx * L
      const ay = dx * off - dy * L
      const bx = -dy * off + dx * L
      const by = dx * off + dy * L
      const hue = (i * 120 + t * 40) % 360
      const H = 150
      g.fillStyle = `hsla(${hue},100%,55%,${0.08 + heat * 0.08})`
      this.poly(g, [this.proj(ax, ay, 0), this.proj(bx, by, 0), this.proj(bx, by, H), this.proj(ax, ay, H)])
      g.fill()
      g.strokeStyle = `hsla(${hue},100%,65%,0.85)`
      g.shadowColor = `hsl(${hue},100%,60%)`
      g.shadowBlur = 12
      g.lineWidth = 2
      for (let z = 8; z <= H; z += H / 7) {
        const p = this.proj(ax, ay, z)
        const q = this.proj(bx, by, z)
        g.beginPath()
        g.moveTo(p.x, p.y)
        g.lineTo(q.x, q.y)
        g.stroke()
      }
    }
    g.restore()
  }

  // CO2 cannons: columns of white smoke blasting up from the floor.
  smoke(g, t, E, seed, heat, lv) {
    const n = Math.round(2 + heat * (2 + lv * 4))
    for (let i = 0; i < n; i++) {
      const period = 2.4 - heat * 0.6
      const tt = t + (i * period) / n
      const cyc = Math.floor(tt / period)
      const u = (tt - cyc * period) / period
      const r0 = Math.sqrt(hash('smr' + seed + i + ':' + cyc)) * E * 0.85
      const a0 = hash('sma' + seed + i + ':' + cyc) * TAU
      const x = Math.cos(a0) * r0
      const y = Math.sin(a0) * r0
      for (let k = 0; k < 6; k++) {
        const v = u - k * 0.05
        if (v <= 0) continue
        const z = v * 300
        const rad = 25 + v * 120
        const a = Math.max(0, (1 - v) * 0.75)
        const P = this.proj(x + Math.sin(k * 2.1) * v * 20, y, z)
        const R = rad * P.k
        const sg = g.createRadialGradient(P.x, P.y, 0, P.x, P.y, R)
        sg.addColorStop(0, `rgba(245,245,255,${a})`)
        sg.addColorStop(1, 'rgba(245,245,255,0)')
        g.fillStyle = sg
        g.beginPath()
        g.arc(P.x, P.y, R, 0, TAU)
        g.fill()
      }
    }
  }

  // Lights out: the club goes dark except for a few roaming spotlights.
  darkness(g, t, E, heat, lv) {
    const spots = Math.max(2, 4 - Math.round(lv * 2))
    const R = E * (0.3 - 0.08 * lv)
    g.save()
    g.beginPath()
    g.rect(0, 0, this.w, this.h)
    const centers = []
    for (let i = 0; i < spots; i++) {
      const x = Math.sin(t * (0.5 + i * 0.17) + i * 2.4) * E * 0.7
      const y = Math.cos(t * (0.42 + i * 0.13) + i * 1.1) * E * 0.65
      centers.push([x, y])
      const n = 40
      for (let j = 0; j <= n; j++) {
        const a = -(j / n) * TAU // opposite winding cuts a hole
        const p = this.proj(x + Math.cos(a) * R, y + Math.sin(a) * R, 0)
        if (j) g.lineTo(p.x, p.y)
        else g.moveTo(p.x, p.y)
      }
      g.closePath()
    }
    g.fillStyle = `rgba(2,0,8,${0.55 + heat * (0.3 + 0.1 * lv)})`
    g.fill('evenodd')
    g.globalCompositeOperation = 'lighter'
    for (const [x, y] of centers) this.flatBlob(g, x, y, R, 0, 'rgba(255,250,220,0.12)', 'rgba(255,250,220,0)')
    g.restore()
  }

  confettiStorm(lv) {
    if (this.particles.length > 900) return
    const n = 2 + Math.round(lv * 4)
    const colors = ['#ff3cac', '#00e5ff', '#ffe600', '#7cff4f', '#ff8a00', '#b26bff', '#ffffff']
    for (let i = 0; i < n; i++) {
      this.particles.push({
        world: false, x: Math.random() * this.w, y: -20,
        vx: (Math.random() - 0.5) * 160, vy: 160 + Math.random() * 260, life: 5, age: 0,
        color: colors[(Math.random() * colors.length) | 0], size: 8 + Math.random() * 10, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 10, kind: 'confetti',
      })
    }
  }

  // --- 3D set dressing ---------------------------------------------------------------------

  // Speaker stacks on the back of the stage, cones pumping to the kick.
  speakers(scene, E, pulse) {
    for (const side of [-1, 1]) {
      const a = -Math.PI / 2 + side * 0.62
      const x = Math.cos(a) * E * 0.86
      const y = Math.sin(a) * E * 0.86
      scene.push({ x, y, draw: (g) => this.speakerStack(g, x, y, Math.atan2(-y, -x), pulse) })
    }
  }

  speakerStack(g, x, y, face, pulse) {
    const w = 46
    const d = 34
    const H = 150
    const cs = Math.cos(face)
    const sn = Math.sin(face)
    const W = (lx, ly, z) => this.proj(x + lx * cs - ly * sn, y + lx * sn + ly * cs, z)
    this.flatBlob(g, x, y, 70, 0, 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0)')
    const fr = face + this.yaw
    const faces = [
      { pts: [[d, -w], [d, w]], ny: Math.sin(fr), front: true },
      { pts: [[-d, w], [-d, -w]], ny: -Math.sin(fr) },
      { pts: [[d, w], [-d, w]], ny: Math.cos(fr) },
      { pts: [[-d, -w], [d, -w]], ny: -Math.cos(fr) },
    ]
    for (const f of faces) {
      if (f.ny <= 0) continue
      const [[ax, ay], [bx, by]] = f.pts
      g.fillStyle = f.front ? '#15121e' : '#0a0810'
      this.poly(g, [W(ax, ay, 0), W(bx, by, 0), W(bx, by, H), W(ax, ay, H)])
      g.fill()
      g.strokeStyle = 'rgba(255,255,255,0.12)'
      g.lineWidth = 1
      g.stroke()
      if (f.front) {
        for (const [cz, cr] of [[30, 20], [78, 20], [124, 11]]) {
          const c = W(d + 0.5, 0, cz)
          const r = cr * c.k * (1 + pulse * 0.12)
          g.save()
          g.translate(c.x, c.y)
          g.scale(Math.abs(Math.sin(fr)), 1)
          const cg = g.createRadialGradient(0, 0, 0, 0, 0, r)
          cg.addColorStop(0, '#555')
          cg.addColorStop(0.3, '#111')
          cg.addColorStop(0.9, '#2a2a33')
          cg.addColorStop(1, '#ff3cac')
          g.fillStyle = cg
          g.beginPath()
          g.arc(0, 0, r, 0, TAU)
          g.fill()
          g.restore()
        }
      }
    }
    g.fillStyle = '#221d30'
    this.poly(g, [W(-d, -w, H), W(d, -w, H), W(d, w, H), W(-d, w, H)])
    g.fill()
  }

  // A mirror ball hanging over the floor, throwing light specks around.
  mirrorBall(g, E, t, pulse, phase) {
    const z = E * 0.75
    const P = this.proj(0, 0, z)
    const r = Math.max(14, 30 * P.k)
    g.strokeStyle = 'rgba(255,255,255,0.35)'
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(P.x, 0)
    g.lineTo(P.x, P.y - r)
    g.stroke()
    g.save()
    g.translate(P.x, P.y)
    g.beginPath()
    g.arc(0, 0, r, 0, TAU)
    g.clip()
    const bg = g.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r)
    bg.addColorStop(0, '#fff')
    bg.addColorStop(0.6, '#8c8fa8')
    bg.addColorStop(1, '#25223a')
    g.fillStyle = bg
    g.fillRect(-r, -r, r * 2, r * 2)
    const n = 7
    const cell = (r * 2) / n
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        const tw = Math.sin(t * 5 + a * 1.3 + b * 2.1)
        if (tw > 0.5) {
          g.fillStyle = `rgba(255,255,255,${tw - 0.4})`
          g.fillRect(-r + a * cell + 1, -r + b * cell + 1, cell - 2, cell - 2)
        }
      }
    }
    g.restore()
    if (phase !== 'music' && phase !== 'lobby') return
    // light specks sweeping over the floor
    g.save()
    g.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 46; i++) {
      const rr = (0.15 + hash('mb' + i) * 0.85) * E
      const a = hash('mba' + i) * TAU + t * 0.35
      const p = this.proj(Math.cos(a) * rr, Math.sin(a) * rr, 1)
      g.fillStyle = `hsla(${(i * 37 + t * 50) % 360},100%,80%,${0.35 + pulse * 0.4})`
      g.beginPath()
      g.ellipse(p.x, p.y, 4 * p.k + 1, 4 * p.k * this.cosT + 1, 0, 0, TAU)
      g.fill()
    }
    g.restore()
  }

  bird(g, x, y, z, ang, flapT, kind) {
    const P = this.proj(x, y, z)
    const span = 26 * P.k
    const flap = Math.sin(flapT)
    g.save()
    g.translate(P.x, P.y)
    g.rotate(ang + this.yaw + Math.PI / 2)
    g.fillStyle = kind ? '#14061f' : '#1b0b10'
    g.strokeStyle = kind ? 'rgba(0,229,255,0.7)' : 'rgba(255,60,172,0.7)'
    g.lineWidth = 1.2
    const tipY = -flap * span * 0.55
    g.beginPath()
    g.moveTo(0, -span * 0.15)
    g.quadraticCurveTo(-span * 0.5, tipY - span * 0.25, -span, tipY)
    g.quadraticCurveTo(-span * 0.45, tipY * 0.3 + span * 0.05, 0, span * 0.2)
    g.quadraticCurveTo(span * 0.45, tipY * 0.3 + span * 0.05, span, tipY)
    g.quadraticCurveTo(span * 0.5, tipY - span * 0.25, 0, -span * 0.15)
    g.closePath()
    g.fill()
    g.stroke()
    g.restore()
  }

  worldParticles(g, dt) {
    this.reactions = this.reactions.filter((r) => (r.age += dt) < 1.8)
    g.globalCompositeOperation = 'lighter'
    for (const p of this.particles) {
      if (!p.world) continue
      p.age += dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vx *= 0.94
      p.vy *= 0.94
      const a = Math.max(0, 1 - p.age / p.life)
      const P = this.proj(p.x, p.y, 30 + p.age * 40)
      g.fillStyle = p.color
      g.globalAlpha = a
      g.beginPath()
      g.arc(P.x, P.y, (p.size * a + 0.5) * P.k, 0, TAU)
      g.fill()
    }
    g.globalAlpha = 1
    g.globalCompositeOperation = 'source-over'
  }

  screenParticles(g, dt) {
    for (const p of this.particles) {
      if (p.world) continue
      p.age += dt
      p.x += p.vx * dt + Math.sin(p.age * 3 + p.rot) * 0.6
      p.y += p.vy * dt
      p.rot += p.vr * dt
      g.save()
      g.translate(p.x, p.y)
      g.rotate(p.rot)
      g.fillStyle = p.color
      g.globalAlpha = Math.max(0, 1 - p.age / p.life)
      g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      g.restore()
    }
    this.particles = this.particles.filter((p) => p.age < p.life && (p.world || p.y < this.h + 40))
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}
