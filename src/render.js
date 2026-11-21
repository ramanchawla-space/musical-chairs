// Canvas renderer: animated themed backdrop, a raised 3D light-up stage seen
// in perspective, solid 3D chairs, dancing avatars, a pool of random
// hazards (fog, birds, bouncers, disco balls, lasers, smoke, lights out...), the "BOOTED!" kick-out animation, reactions and confetti.

import { avatarCanvas } from './avatars.js'
import { PLAYER_RADIUS, CHAIR_RADIUS, chairVisibility, chairLayout, chairPosAt, roundLevel, bouncers, BOUNCER_RADIUS, roamPos } from './core.js'

export const THEME_INFO = {
  neon: {
    label: 'Neon Rave', blurb: 'Lasers, haze & a light-up floor',
    accent: '#ff3cac', accent2: '#00e5ff', chair: '#00e5ff', hue: 300, floor: 'rgba(12,0,30,0.5)',
  },
  cosmic: {
    label: 'Cosmic Galaxy', blurb: 'Nebulae, starfields & a spiral galaxy',
    accent: '#8b5cff', accent2: '#2bffc6', chair: '#b9a6ff', hue: 220, floor: 'rgba(4,2,22,0.42)',
  },
  sunset: {
    label: 'Synthwave Sunset', blurb: 'Retro sun, grid horizon & mountains',
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
    this.stars = Array.from({ length: 280 }, (_, i) => ({
      x: hash('sx' + i), y: hash('sy' + i), s: 0.4 + hash('ss' + i) * 1.6, p: hash('sp' + i) * TAU,
    }))
    this.galaxy = Array.from({ length: 520 }, (_, i) => {
      const arm = i % 3
      const d = hash('gd' + i)
      return { arm, d, off: (hash('go' + i) - 0.5) * 0.5, s: 0.5 + hash('gs' + i) * 1.5 }
    })
    this.dust = Array.from({ length: 70 }, (_, i) => ({ x: hash('dx' + i), y: hash('dy' + i), v: 0.2 + hash('dv' + i), s: 1 + hash('dsz' + i) * 2.5 }))
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
    const tilt = (portrait ? 0.62 : 0.98) + this.tiltBob
    this.cosY = Math.cos(this.yaw)
    this.sinY = Math.sin(this.yaw)
    this.cosT = Math.cos(tilt)
    this.sinT = Math.sin(tilt)
    this.camD = extent * 3.4
  }

  // Unit-scale bounding box of the projected floor (plus head room at the back).
  footprint(E) {
    const c = this.cosT
    const s = this.sinT
    const D = this.camD
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU
      const x = Math.cos(a) * E
      const y = Math.sin(a) * E
      for (const z of [-40, 70]) {
        const k = D / (D - y * s - z * c)
        const px = x * k
        const py = (y * c - z * s) * k
        x0 = Math.min(x0, px); x1 = Math.max(x1, px)
        y0 = Math.min(y0, py); y1 = Math.max(y1, py)
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
    const extent = round && phase !== 'lobby' ? round.arena : 330
    this.extentNow = this.extentNow ? this.extentNow + (extent - this.extentNow) * Math.min(1, dt * 3) : extent
    const E = this.extentNow
    // The floor slowly turns while the music plays; the Spinning floor hazard
    // whips it round (and reverses) once it stops. Lobby eases back to front.
    const lv = round ? roundLevel(round) : 0
    const spinHaz = round?.hazards?.includes('spin')
    let yawSpeed = 0
    if (phase === 'music') yawSpeed = spinHaz ? 0.25 : 0.06
    else if (phase === 'scramble') yawSpeed = spinHaz ? (0.45 + 0.6 * lv) * Math.sin(t * 0.55) : 0.04
    if (yawSpeed) this.yaw += yawSpeed * dt
    else if (phase === 'lobby' || phase === 'home' || phase === 'winner') this.yaw -= Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw)) * Math.min(1, dt * 1.5)
    this.tiltBob = phase === 'music' ? pulse * 0.025 : 0
    this.setCamera(E)
    const top = 70
    const bottom = phase === 'home' ? 0 : 84
    const availH = this.h - top - bottom
    const pad = this.padRight || 0
    const availW = this.w - pad - 16
    const fp = this.footprint(E)
    const scale = Math.min(availW / (fp.x1 - fp.x0), availH / (fp.y1 - fp.y0))
    const sh = this.shake
    this.shake *= Math.pow(0.02, dt)
    this.view = {
      x: (this.w - pad) / 2 - ((fp.x0 + fp.x1) / 2) * scale + (Math.random() - 0.5) * sh,
      y: top + availH / 2 - ((fp.y0 + fp.y1) / 2) * scale + (Math.random() - 0.5) * sh,
      scale,
    }
    this.scale = scale

    if (client && state) {
      this.floor(g, E, t, pulse, phase)
      const scene = []
      const live = round && (phase === 'music' || phase === 'scramble')
      this.speakers(scene, E, pulse)
      if (round && phase !== 'lobby') this.chairs(scene, client, t, phase, pulse)
      if (live) this.sceneHazards(scene, client, t, phase, E)
      this.players(scene, client, t, pulse, phase, phaseAge)
      // painter's algorithm in camera space: far first
      const depth = (it) => (it.x || 0) * this.sinY + it.y * this.cosY
      scene.sort((a, b) => depth(a) - depth(b))
      for (const item of scene) item.draw(g)
      this.worldParticles(g, dt)
      this.mirrorBall(g, E, t, pulse, phase)
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

  // --- Backgrounds --------------------------------------------------------------------

  background(g, t, pulse) {
    if (this.theme === 'cosmic') return this.bgCosmic(g, t, pulse)
    if (this.theme === 'sunset') return this.bgSunset(g, t, pulse)
    return this.bgNeon(g, t, pulse)
  }

  bgNeon(g, t, pulse) {
    const { w, h } = this
    const bg = g.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, '#0b0020')
    bg.addColorStop(0.55, '#1a0036')
    bg.addColorStop(1, '#050010')
    g.fillStyle = bg
    g.fillRect(0, 0, w, h)
    g.globalCompositeOperation = 'lighter'
    // Haze
    const blobs = [['255,60,172', 0.2], ['0,229,255', 0.16], ['140,60,255', 0.18]]
    blobs.forEach(([c, a], i) => {
      const x = w * (0.5 + 0.38 * Math.sin(t * 0.13 + i * 2.1))
      const y = h * (0.5 + 0.33 * Math.cos(t * 0.11 + i * 1.7))
      const r = Math.max(w, h) * 0.55
      const rg = g.createRadialGradient(x, y, 0, x, y, r)
      rg.addColorStop(0, `rgba(${c},${a + pulse * 0.08})`)
      rg.addColorStop(1, `rgba(${c},0)`)
      g.fillStyle = rg
      g.fillRect(0, 0, w, h)
    })
    // Lasers fanning from the corners
    const sources = [[0, h], [w, h], [0, 0], [w, 0], [w / 2, h + 40]]
    const L = Math.hypot(w, h) * 1.1
    sources.forEach(([sx, sy], si) => {
      const base = Math.atan2(h / 2 - sy, w / 2 - sx)
      for (let i = 0; i < 5; i++) {
        const a = base + Math.sin(t * (0.5 + si * 0.13) + i * 1.3 + si) * 0.65 + (i - 2) * 0.12
        const hue = (t * 40 + si * 70 + i * 25) % 360
        const ex = sx + Math.cos(a) * L
        const ey = sy + Math.sin(a) * L
        const lg = g.createLinearGradient(sx, sy, ex, ey)
        const al = 0.18 + pulse * 0.35
        lg.addColorStop(0, `hsla(${hue},100%,65%,${al})`)
        lg.addColorStop(1, `hsla(${hue},100%,65%,0)`)
        g.strokeStyle = lg
        g.lineWidth = 2 + pulse * 2
        g.beginPath()
        g.moveTo(sx, sy)
        g.lineTo(ex, ey)
        g.stroke()
      }
    })
    // Floating dust
    for (const d of this.dust) {
      const y = ((d.y - t * 0.02 * d.v) % 1 + 1) % 1
      g.fillStyle = `rgba(255,200,255,${0.25 + 0.2 * Math.sin(t * 2 + d.x * 30)})`
      g.beginPath()
      g.arc(d.x * w, y * h, d.s, 0, TAU)
      g.fill()
    }
    g.globalCompositeOperation = 'source-over'
  }

  bgCosmic(g, t, pulse) {
    const { w, h } = this
    const bg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.8)
    bg.addColorStop(0, '#0d0730')
    bg.addColorStop(1, '#010008')
    g.fillStyle = bg
    g.fillRect(0, 0, w, h)
    g.globalCompositeOperation = 'lighter'
    const neb = [['139,92,255', 0.22], ['43,255,198', 0.12], ['255,60,172', 0.14], ['60,120,255', 0.16]]
    neb.forEach(([c, a], i) => {
      const ang = t * 0.03 + i * (TAU / neb.length)
      const x = w / 2 + Math.cos(ang) * w * 0.32
      const y = h / 2 + Math.sin(ang * 1.3) * h * 0.3
      const r = Math.max(w, h) * (0.35 + 0.08 * Math.sin(t * 0.2 + i))
      const rg = g.createRadialGradient(x, y, 0, x, y, r)
      rg.addColorStop(0, `rgba(${c},${a})`)
      rg.addColorStop(1, `rgba(${c},0)`)
      g.fillStyle = rg
      g.fillRect(0, 0, w, h)
    })
    for (const s of this.stars) {
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 1.7 + s.p))
      g.fillStyle = `rgba(255,255,255,${a})`
      g.fillRect(s.x * w, s.y * h, s.s, s.s)
    }
    // Spiral galaxy turning slowly behind the floor
    const cx = w / 2
    const cy = h / 2
    const R = Math.min(w, h) * 0.62
    for (const p of this.galaxy) {
      const r = p.d * R
      const a = p.arm * (TAU / 3) + p.d * 5.2 + p.off - t * 0.05
      const x = cx + Math.cos(a) * r
      const y = cy + Math.sin(a) * r * 0.62
      const hue = 250 - p.d * 90
      g.fillStyle = `hsla(${hue},90%,${70 - p.d * 20}%,${(1 - p.d) * 0.7 + pulse * 0.2})`
      g.fillRect(x, y, p.s, p.s)
    }
    // Shooting star
    const cyc = (t % 5) / 5
    if (cyc < 0.18) {
      const k = Math.floor(t / 5)
      const sx = hash('ssx' + k) * w
      const sy = hash('ssy' + k) * h * 0.5
      const u = cyc / 0.18
      const x = sx + u * 320
      const y = sy + u * 140
      const lg = g.createLinearGradient(x - 120, y - 52, x, y)
      lg.addColorStop(0, 'rgba(255,255,255,0)')
      lg.addColorStop(1, 'rgba(255,255,255,0.9)')
      g.strokeStyle = lg
      g.lineWidth = 2
      g.beginPath()
      g.moveTo(x - 120, y - 52)
      g.lineTo(x, y)
      g.stroke()
    }
    g.globalCompositeOperation = 'source-over'
  }

  bgSunset(g, t, pulse) {
    const { w, h } = this
    const hz = h * 0.6
    const sky = g.createLinearGradient(0, 0, 0, hz)
    sky.addColorStop(0, '#0d0221')
    sky.addColorStop(0.45, '#3b0a54')
    sky.addColorStop(0.8, '#b0186e')
    sky.addColorStop(1, '#ff6b3d')
    g.fillStyle = sky
    g.fillRect(0, 0, w, hz)
    for (const s of this.stars) {
      if (s.y > 0.5) continue
      g.fillStyle = `rgba(255,220,255,${0.3 + 0.5 * Math.sin(t + s.p) ** 2})`
      g.fillRect(s.x * w, s.y * hz, s.s, s.s)
    }
    // The striped retro sun
    const sr = Math.min(w, h) * 0.26 * (1 + pulse * 0.03)
    const sx = w / 2
    const sy = hz - sr * 0.35
    g.save()
    g.beginPath()
    g.arc(sx, sy, sr, 0, TAU)
    g.clip()
    const sg = g.createLinearGradient(0, sy - sr, 0, sy + sr)
    sg.addColorStop(0, '#ffe66b')
    sg.addColorStop(0.5, '#ff8a3c')
    sg.addColorStop(1, '#ff2e88')
    g.fillStyle = sg
    g.fillRect(sx - sr, sy - sr, sr * 2, sr * 2)
    g.fillStyle = '#3b0a54'
    for (let i = 0; i < 8; i++) {
      const yy = sy + sr * (0.05 + i * 0.13) + ((t * 12) % (sr * 0.13))
      g.fillRect(sx - sr, yy, sr * 2, 2 + i * 1.6)
    }
    g.restore()
    g.globalCompositeOperation = 'lighter'
    const glow = g.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr * 2.2)
    glow.addColorStop(0, 'rgba(255,90,140,0.35)')
    glow.addColorStop(1, 'rgba(255,90,140,0)')
    g.fillStyle = glow
    g.fillRect(0, 0, w, hz)
    g.globalCompositeOperation = 'source-over'
    // Mountains
    const ridge = (amp, base, color, seed) => {
      g.fillStyle = color
      g.beginPath()
      g.moveTo(0, hz)
      for (let x = 0; x <= w + 20; x += 20) {
        const n = Math.sin(x * 0.006 + seed) * 0.5 + Math.sin(x * 0.017 + seed * 2) * 0.3 + Math.sin(x * 0.041 + seed * 3) * 0.2
        g.lineTo(x, hz - base - Math.abs(n) * amp)
      }
      g.lineTo(w, hz)
      g.fill()
    }
    ridge(h * 0.14, 6, '#24083d', 1.2)
    ridge(h * 0.08, 0, '#150326', 4.1)
    // Grid floor
    const fg = g.createLinearGradient(0, hz, 0, h)
    fg.addColorStop(0, '#1a0430')
    fg.addColorStop(1, '#080012')
    g.fillStyle = fg
    g.fillRect(0, hz, w, h - hz)
    g.strokeStyle = `rgba(255,46,136,${0.55 + pulse * 0.3})`
    g.lineWidth = 1.5
    g.beginPath()
    for (let i = -20; i <= 20; i++) {
      g.moveTo(w / 2 + i * 12, hz)
      g.lineTo(w / 2 + i * w * 0.16, h)
    }
    const off = (t * 0.6) % 1
    for (let i = 0; i < 14; i++) {
      const u = (i + off) / 14
      const y = hz + (h - hz) * u * u
      g.moveTo(0, y)
      g.lineTo(w, y)
    }
    g.stroke()
    g.fillStyle = 'rgba(255,120,200,0.8)'
    g.fillRect(0, hz - 1, w, 2)
  }

  // --- Dance floor (a raised 3D stage) ------------------------------------------------------

  floor(g, R, t, pulse, phase) {
    const th = THEME_INFO[this.theme]
    const stopped = phase === 'scramble' || phase === 'result'
    const H = 34
    // Stage side wall: the front half of the cylinder, from the rim down.
    const front = []
    const back = []
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI - this.yaw
      front.push(this.proj(Math.cos(a) * R, Math.sin(a) * R, 0))
      back.push(this.proj(Math.cos(a) * R, Math.sin(a) * R, -H))
    }
    const lowest = back.reduce((m, p) => Math.max(m, p.y), 0)
    const side = g.createLinearGradient(0, front[20].y, 0, lowest)
    side.addColorStop(0, '#2a0a45')
    side.addColorStop(1, '#07010f')
    g.fillStyle = side
    this.poly(g, [...front, ...back.reverse()])
    g.fill()
    // under-glow LED strip along the bottom edge
    g.save()
    g.shadowColor = th.accent2
    g.shadowBlur = 20 + pulse * 20
    g.strokeStyle = th.accent2
    g.lineWidth = 3
    g.beginPath()
    back.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)))
    g.stroke()
    g.restore()

    // Top surface
    g.fillStyle = '#0a0216'
    this.groundPath(g, 0, 0, R)
    g.fill()
    g.fillStyle = th.floor
    g.fill()

    // Light-up tiles (each tile is a projected polygon, so they foreshorten)
    g.globalCompositeOperation = 'lighter'
    const rings = 7
    for (let j = 0; j < rings; j++) {
      const r0 = (j / rings) * R
      const r1 = ((j + 1) / rings) * R - 3
      const segs = 10 + j * 6
      for (let s = 0; s < segs; s++) {
        const a0 = (s / segs) * TAU + j * 0.2
        const a1 = a0 + TAU / segs - 0.03
        const wave = 0.5 + 0.5 * Math.sin(s * (TAU / segs) * 3 - t * 3 + j * 0.9)
        const hue = (th.hue + (s / segs) * 120 + t * 30 + j * 20) % 360
        const al = stopped ? 0.07 + 0.1 * wave : 0.06 + 0.3 * wave * wave * (0.45 + pulse * 0.8)
        g.fillStyle = stopped ? `hsla(${350 + wave * 20},95%,55%,${al})` : `hsla(${hue},100%,60%,${al})`
        const n = 3
        const pts = []
        for (let q = 0; q <= n; q++) {
          const a = a0 + ((a1 - a0) * q) / n
          pts.push(this.proj(Math.cos(a) * r1, Math.sin(a) * r1))
        }
        for (let q = n; q >= 0; q--) {
          const a = a0 + ((a1 - a0) * q) / n
          pts.push(this.proj(Math.cos(a) * r0, Math.sin(a) * r0))
        }
        this.poly(g, pts)
        g.fill()
      }
    }
    // Sweeping spotlights on the floor (searchlights once the music stops)
    for (let i = 0; i < 3; i++) {
      const sp = stopped ? 1.4 : 0.45
      const x = Math.sin(t * sp * (0.7 + i * 0.23) + i * 2.1) * R * 0.65
      const y = Math.cos(t * sp * (0.5 + i * 0.31) + i * 1.3) * R * 0.65
      const col = stopped ? '255,240,220' : `${i === 0 ? '255,60,172' : i === 1 ? '0,229,255' : '255,230,0'}`
      this.flatBlob(g, x, y, R * 0.28, 0, `rgba(${col},${0.22 + pulse * 0.1})`, `rgba(${col},0)`)
      // light shaft from the rig above down to the pool of light
      const P = this.proj(x, y, 0)
      const hw = R * 0.26 * P.k
      const src = { x: this.w * (0.2 + 0.3 * i), y: -20 }
      const lg = g.createLinearGradient(src.x, src.y, P.x, P.y)
      lg.addColorStop(0, `rgba(${col},0)`)
      lg.addColorStop(1, `rgba(${col},${0.07 + pulse * 0.05})`)
      g.fillStyle = lg
      g.beginPath()
      g.moveTo(src.x - 6, src.y)
      g.lineTo(src.x + 6, src.y)
      g.lineTo(P.x + hw, P.y)
      g.lineTo(P.x - hw, P.y)
      g.closePath()
      g.fill()
    }
    g.globalCompositeOperation = 'source-over'

    // Glowing rim
    g.save()
    g.shadowColor = th.accent
    g.shadowBlur = 30 + pulse * 30
    g.strokeStyle = th.accent
    g.lineWidth = 4
    this.groundPath(g, 0, 0, R)
    g.stroke()
    g.restore()
    g.strokeStyle = th.accent2
    g.globalAlpha = 0.5
    g.setLineDash([10, 14])
    g.lineDashOffset = -t * 40
    g.lineWidth = 2
    this.groundPath(g, 0, 0, R - 12)
    g.stroke()
    g.setLineDash([])
    g.globalAlpha = 1
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
      // Wild chairs blink out of sight (a faint shimmer is all that's left).
      const vis = wild && !taken ? Math.max(0.04, chairVisibility(round.seed, i, since, lv)) : 1
      scene.push({ x: c.x, y: c.y, draw: (g) => this.drawChair(g, c, i, t, pulse, th, taken, scramble && !taken, vis) })
    })
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
      this.decoyRound = { ...round, seed, chairs: chairLayout('scatter', n, seed) }
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

  drawChair(g, c, i, t, pulse, th, taken, free, vis) {
    if (vis <= 0.01) return
    g.save()
    g.globalAlpha = vis
    const s = CHAIR_RADIUS * 0.8
    const H = 22
    const BH = 30
    const cs = Math.cos(c.face)
    const sn = Math.sin(c.face)
    const W = (lx, ly, z) => this.proj(c.x + lx * cs - ly * sn, c.y + lx * sn + ly * cs, z)
    const k = this.proj(c.x, c.y, H).k
    const main = taken ? '#ffffff' : th.chair
    const back = taken ? '#ffffff' : th.accent2
    // contact shadow + "free chair" throb ring on the floor
    this.flatBlob(g, c.x, c.y, s * 1.7, 0, 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0)')
    if (free) {
      const q = 0.5 + 0.5 * Math.sin(t * 10 + i)
      g.strokeStyle = `rgba(255,255,120,${0.35 + 0.4 * q})`
      g.lineWidth = 3
      this.groundPath(g, c.x, c.y, CHAIR_RADIUS + 10 + q * 6)
      g.stroke()
    }
    // legs
    g.strokeStyle = 'rgba(25,12,40,0.95)'
    g.lineWidth = Math.max(1.5, 3.2 * k)
    g.lineCap = 'round'
    for (const [lx, ly] of [[-0.8, -0.8], [-0.8, 0.8], [0.8, -0.8], [0.8, 0.8]]) {
      const a = W(lx * s, ly * s, 0)
      const b = W(lx * s, ly * s, H - 4)
      g.beginPath()
      g.moveTo(a.x, a.y)
      g.lineTo(b.x, b.y)
      g.stroke()
    }
    // The backrest sits on the local -x side; draw it first if it's farther away.
    const fr = c.face + this.yaw
    const vsn = Math.sin(fr)
    const vcs = Math.cos(fr)
    const backBehind = -vsn < 0
    const backrest = () => {
      g.fillStyle = back
      g.shadowColor = back
      g.shadowBlur = 10
      this.poly(g, [W(-s, -s, H), W(-s, s, H), W(-s, s, H + BH), W(-s, -s, H + BH)])
      g.fill()
      g.shadowBlur = 0
      g.fillStyle = 'rgba(0,0,0,0.22)'
      this.poly(g, [W(-s, -s * 0.7, H + BH * 0.25), W(-s, s * 0.7, H + BH * 0.25), W(-s, s * 0.7, H + BH * 0.75), W(-s, -s * 0.7, H + BH * 0.75)])
      g.fill()
    }
    if (backBehind) backrest()
    // seat slab: the side faces turned towards the camera, then the top
    const T = 5
    const faces = [
      { a: [s, -s], b: [s, s], ny: vsn }, { a: [-s, s], b: [-s, -s], ny: -vsn },
      { a: [s, s], b: [-s, s], ny: vcs }, { a: [-s, -s], b: [s, -s], ny: -vcs },
    ]
    g.fillStyle = taken ? '#bdb3d9' : th.accent
    for (const f of faces) {
      if (f.ny <= 0) continue
      this.poly(g, [W(f.a[0], f.a[1], H), W(f.b[0], f.b[1], H), W(f.b[0], f.b[1], H - T), W(f.a[0], f.a[1], H - T)])
      g.fill()
    }
    const top = [W(-s, -s, H), W(s, -s, H), W(s, s, H), W(-s, s, H)]
    const grad = g.createLinearGradient(top[0].x, top[0].y, top[2].x, top[2].y)
    grad.addColorStop(0, '#ffffff')
    grad.addColorStop(0.35, main)
    grad.addColorStop(1, taken ? '#d9d2f2' : th.accent)
    g.fillStyle = grad
    g.shadowColor = main
    g.shadowBlur = 14 + pulse * 12
    this.poly(g, top)
    g.fill()
    g.shadowBlur = 0
    // stitched cushion
    g.strokeStyle = 'rgba(0,0,0,0.28)'
    g.lineWidth = 1.2
    g.setLineDash([3, 3])
    this.poly(g, [W(-s * 0.7, -s * 0.7, H + 0.5), W(s * 0.7, -s * 0.7, H + 0.5), W(s * 0.7, s * 0.7, H + 0.5), W(-s * 0.7, s * 0.7, H + 0.5)])
    g.stroke()
    g.setLineDash([])
    if (!backBehind) backrest()
    g.restore()
  }

  // --- Players (upright billboards standing on the floor) --------------------------------

  players(scene, client, t, pulse, phase, phaseAge) {
    const pos = client.positions()
    const me = client.me
    this.lastPos = pos
    for (const [id, p] of pos) {
      const info = client.roster.get(id)
      if (!info) continue
      let { x, y } = p
      let z = 0
      let scale = 1
      let rot = 0
      let alpha = 1
      let boot = null
      if (p.mode === 'booted' && phase === 'result') {
        // Kicked off the stage: launched outward and up, spinning.
        const e = phaseAge
        const d = Math.hypot(x, y) || 1
        const ux = x / d
        const uy = y / d
        const fly = Math.max(0, e - 0.35)
        x += ux * fly * 900
        y += uy * fly * 900
        z = Math.sin(Math.min(fly, 1) * Math.PI) * 220 + fly * 60
        rot = fly * 14
        scale = Math.max(0.3, 1 - fly * 0.4)
        alpha = Math.max(0, 1 - fly * 0.7)
        if (e < 0.6) boot = { e, ux, uy, px: p.x, py: p.y }
        if (alpha <= 0) continue
      }
      const seed = hash(id)
      const dancing = p.mode === 'dance' || p.mode === 'idle'
      if (dancing) {
        z += Math.abs(Math.sin(t * 7 + seed * 20)) * 8 + pulse * 6
        scale *= 1 + pulse * 0.08
        rot = Math.sin(t * 3.5 + seed * 10) * 0.18
      }
      if (p.mode === 'seated') { scale *= 0.92; z += 24 }
      if (p.mode === 'champ') { scale *= 2.6 + pulse * 0.15; z += 10 + Math.sin(t * 3) * 6 }
      const r = PLAYER_RADIUS * scale
      const depthY = p.mode === 'seated' ? y + 0.5 : y
      scene.push({ x, y: depthY, draw: (g) => {
        g.save()
        g.globalAlpha = alpha
        if (boot) {
          const k = boot.e < 0.35 ? Math.sin((boot.e / 0.35) * Math.PI) * 18 : 0
          const bp = this.proj(boot.px - boot.ux * (46 - k), boot.py - boot.uy * (46 - k), 20)
          g.font = `${Math.round(44 * bp.k)}px "Apple Color Emoji","Segoe UI Emoji",sans-serif`
          g.textAlign = 'center'
          g.textBaseline = 'middle'
          g.fillText('🥾', bp.x, bp.y)
        }
        // shadow on the floor (shrinks as you jump)
        const sa = Math.max(0.1, 0.5 - z / 400)
        this.flatBlob(g, x, y, r * 1.1, 0, `rgba(0,0,0,${sa})`, 'rgba(0,0,0,0)')
        const C = this.proj(x, y, z + r + 4)
        const R = r * C.k
        g.translate(C.x, C.y)
        g.rotate(rot)
        g.shadowColor = info.color
        g.shadowBlur = 18
        g.fillStyle = info.color
        g.beginPath()
        g.arc(0, 0, R + 3.5 * C.k, 0, TAU)
        g.fill()
        g.shadowBlur = 0
        g.drawImage(avatarCanvas(info.avatar, 96), -R, -R, R * 2, R * 2)
        // a little specular highlight sells the "ball" look
        const hl = g.createRadialGradient(-R * 0.35, -R * 0.45, 0, -R * 0.35, -R * 0.45, R * 0.9)
        hl.addColorStop(0, 'rgba(255,255,255,0.35)')
        hl.addColorStop(1, 'rgba(255,255,255,0)')
        g.fillStyle = hl
        g.beginPath()
        g.arc(0, 0, R, 0, TAU)
        g.fill()
        if (id === me) {
          g.strokeStyle = '#ffffff'
          g.lineWidth = 3
          g.setLineDash([6, 5])
          g.lineDashOffset = t * 30
          g.beginPath()
          g.arc(0, 0, R + 9 * C.k, 0, TAU)
          g.stroke()
          g.setLineDash([])
        }
        g.rotate(-rot)
        // name tag
        const fs = Math.max(9, Math.round(12 * C.k))
        g.font = `700 ${fs}px Outfit, system-ui, sans-serif`
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        const label = id === me ? `${info.name} (you)` : info.name
        const tw = g.measureText(label).width + 12
        g.fillStyle = 'rgba(8,0,20,0.72)'
        roundRect(g, -tw / 2, R + 6, tw, fs + 5, 8)
        g.fill()
        g.fillStyle = id === me ? '#ffffff' : '#f2e6ff'
        g.fillText(label, 0, R + 6 + (fs + 5) / 2)
        if (id === me && p.mode !== 'seated' && phase !== 'lobby') {
          g.fillStyle = '#ffe600'
          g.font = '800 13px Outfit, system-ui, sans-serif'
          g.fillText('▼ YOU', 0, -R - 16 + Math.sin(t * 6) * 3)
        }
        if (p.mode === 'booted' && phase === 'result' && phaseAge < 2.2) {
          g.font = '900 20px Bungee, Impact, sans-serif'
          g.fillStyle = '#ff3c5a'
          g.fillText('BOOTED!', 0, -R - 22)
        }
        if (p.mode === 'champ') {
          g.font = `${Math.round(30 * C.k)}px "Apple Color Emoji","Segoe UI Emoji",sans-serif`
          g.fillText('👑', 0, -R - 14 * C.k + Math.sin(t * 4) * 6)
        }
        g.restore()
      } })
    }
  }

  reactionsAndTarget(g, client, t, phase) {
    const pos = this.lastPos
    for (const rc of this.reactions) {
      const p = pos?.get(rc.id)
      if (!p) continue
      const u = rc.age / 1.8
      const P = this.proj(p.x + rc.dx * u, p.y, 60 + u * 80)
      g.globalAlpha = Math.max(0, 1 - u)
      g.font = `${Math.round(28 * Math.min(1.6, P.k))}px "Apple Color Emoji","Segoe UI Emoji",sans-serif`
      g.textAlign = 'center'
      g.fillText(rc.e, P.x, P.y)
      g.globalAlpha = 1
    }
    const tgt = client.targetPoint?.()
    if (tgt && phase === 'scramble') {
      g.strokeStyle = 'rgba(255,255,255,0.75)'
      g.lineWidth = 2
      this.groundPath(g, tgt.x, tgt.y, 10 + Math.sin(t * 10) * 3)
      g.stroke()
    }
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
