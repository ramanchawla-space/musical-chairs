// Canvas renderer: animated themed backdrop, a light-up dance floor, chairs,
// dancing avatars, the "BOOTED!" kick-out animation, reactions and confetti.

import { avatarCanvas } from './avatars.js'
import { PLAYER_RADIUS, CHAIR_RADIUS } from './core.js'

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

  // Screen <-> world.
  toWorld(sx, sy) {
    const v = this.view
    return { x: (sx - v.x) / v.scale, y: (sy - v.y) / v.scale }
  }

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

    // Fit the arena between the HUD bars, easing when the arena resizes.
    const extent = round && phase !== 'lobby' ? round.arena : 330
    const top = 76
    const bottom = phase === 'home' ? 0 : 92
    const availH = this.h - top - bottom
    const pad = this.padRight || 0
    const target = Math.min(this.w - pad, availH) / (2 * extent * 1.04)
    this.scale += (target - this.scale) * Math.min(1, dt * 3)
    const sh = this.shake
    this.shake *= Math.pow(0.02, dt)
    this.view = {
      x: (this.w - pad) / 2 + (Math.random() - 0.5) * sh,
      y: top + availH / 2 + (Math.random() - 0.5) * sh,
      scale: this.scale,
    }

    if (client && state) {
      g.save()
      g.translate(this.view.x, this.view.y)
      g.scale(this.scale, this.scale)
      this.floor(g, extent, t, pulse, phase)
      if (round && phase !== 'lobby') this.chairs(g, client, t, phase, pulse)
      this.players(g, client, t, pulse, phase, phaseAge)
      this.worldParticles(g, dt)
      g.restore()
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

  // --- Dance floor ------------------------------------------------------------------------

  floor(g, R, t, pulse, phase) {
    const th = THEME_INFO[this.theme]
    g.fillStyle = th.floor
    g.beginPath()
    g.arc(0, 0, R, 0, TAU)
    g.fill()
    g.globalCompositeOperation = 'lighter'
    const rings = 7
    const stopped = phase === 'scramble' || phase === 'result'
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
        g.beginPath()
        g.arc(0, 0, r1, a0, a1)
        g.arc(0, 0, Math.max(0, r0), a1, a0, true)
        g.closePath()
        g.fill()
      }
    }
    g.globalCompositeOperation = 'source-over'
    g.save()
    g.shadowColor = th.accent
    g.shadowBlur = 30 + pulse * 30
    g.strokeStyle = th.accent
    g.lineWidth = 4
    g.beginPath()
    g.arc(0, 0, R, 0, TAU)
    g.stroke()
    g.restore()
    g.strokeStyle = th.accent2
    g.globalAlpha = 0.5
    g.setLineDash([10, 14])
    g.lineDashOffset = -t * 40
    g.lineWidth = 2
    g.beginPath()
    g.arc(0, 0, R - 12, 0, TAU)
    g.stroke()
    g.setLineDash([])
    g.globalAlpha = 1
  }

  // --- Chairs --------------------------------------------------------------------------

  chairs(g, client, t, phase, pulse) {
    const th = THEME_INFO[this.theme]
    const pts = client.chairPoints()
    const owners = client.state.owners
    const scramble = phase === 'scramble'
    pts.forEach((c, i) => {
      const taken = !!owners[i]
      g.save()
      g.translate(c.x, c.y)
      if (scramble && !taken) {
        // Free chairs throb so they're easy to spot in the chaos.
        const k = 0.5 + 0.5 * Math.sin(t * 10 + i)
        g.fillStyle = `rgba(255,255,120,${0.12 + 0.18 * k})`
        g.beginPath()
        g.arc(0, 0, CHAIR_RADIUS + 14 + k * 6, 0, TAU)
        g.fill()
      }
      g.rotate(c.face)
      const s = CHAIR_RADIUS * 1.12
      const main = taken ? '#ffffff' : th.chair
      g.shadowColor = main
      g.shadowBlur = 18 + pulse * 14
      // legs peeking out from under the seat
      g.fillStyle = 'rgba(0,0,0,0.55)'
      for (const [lx, ly] of [[-0.62, -0.7], [-0.62, 0.7], [0.66, -0.7], [0.66, 0.7]]) {
        g.beginPath()
        g.arc(lx * s, ly * s, s * 0.14, 0, TAU)
        g.fill()
      }
      // seat
      const seat = g.createLinearGradient(-s, -s, s, s)
      seat.addColorStop(0, main)
      seat.addColorStop(1, taken ? '#d9d2f2' : th.accent)
      g.fillStyle = seat
      roundRect(g, -s * 0.72, -s * 0.78, s * 1.5, s * 1.56, 9)
      g.fill()
      g.shadowBlur = 0
      // cushion with a stitched rim
      const cush = g.createRadialGradient(-s * 0.1, -s * 0.2, 0, 0, 0, s)
      cush.addColorStop(0, 'rgba(255,255,255,0.55)')
      cush.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = cush
      roundRect(g, -s * 0.52, -s * 0.58, s * 1.1, s * 1.16, 7)
      g.fill()
      g.strokeStyle = 'rgba(0,0,0,0.25)'
      g.lineWidth = 1.5
      g.setLineDash([3, 3])
      roundRect(g, -s * 0.55, -s * 0.61, s * 1.16, s * 1.22, 7)
      g.stroke()
      g.setLineDash([])
      // backrest on the inner side
      g.shadowColor = taken ? '#fff' : th.accent2
      g.shadowBlur = 12
      g.fillStyle = taken ? '#ffffff' : th.accent2
      roundRect(g, -s * 1.08, -s * 0.92, s * 0.36, s * 1.84, 6)
      g.fill()
      g.shadowBlur = 0
      g.restore()
    })
  }

  // --- Players --------------------------------------------------------------------------

  players(g, client, t, pulse, phase, phaseAge) {
    const pos = client.positions()
    const me = client.me
    // Draw standing players last so they're on top of seated ones.
    const entries = [...pos.entries()].sort((a, b) => (a[1].mode === 'seated' ? -1 : 0) - (b[1].mode === 'seated' ? -1 : 0))
    for (const [id, p] of entries) {
      const info = client.roster.get(id)
      if (!info) continue
      let { x, y } = p
      let scale = 1
      let rot = 0
      let alpha = 1
      if (p.mode === 'booted' && phase === 'result') {
        // Kicked off the floor: launch outward, spinning.
        const e = phaseAge
        const d = Math.hypot(x, y) || 1
        const ux = x / d
        const uy = y / d
        const fly = Math.max(0, e - 0.35)
        x += ux * fly * 900
        y += uy * fly * 900 - Math.sin(Math.min(fly, 1) * Math.PI) * 120
        rot = fly * 14
        scale = Math.max(0.3, 1 - fly * 0.4)
        alpha = Math.max(0, 1 - fly * 0.7)
        if (e < 0.6) {
          g.font = '44px "Apple Color Emoji","Segoe UI Emoji",sans-serif'
          g.textAlign = 'center'
          g.textBaseline = 'middle'
          const kick = Math.sin(Math.min(1, e / 0.35) * Math.PI) * 18
          g.fillText('🥾', p.x - ux * (46 - kick), p.y - uy * (46 - kick))
        }
        if (alpha <= 0) continue
      }
      const seed = hash(id)
      const dancing = p.mode === 'dance' || p.mode === 'idle'
      if (dancing) {
        const bob = Math.sin(t * 7 + seed * 20)
        y += bob * 3 - pulse * 4
        scale *= 1 + pulse * 0.1
        rot = Math.sin(t * 3.5 + seed * 10) * 0.18
      }
      if (p.mode === 'seated') scale *= 0.92
      if (p.mode === 'champ') { scale *= 2.6 + pulse * 0.15; y += Math.sin(t * 3) * 6 }
      const r = PLAYER_RADIUS * scale
      g.save()
      g.globalAlpha = alpha
      g.translate(x, y)
      // shadow
      g.fillStyle = 'rgba(0,0,0,0.35)'
      g.beginPath()
      g.ellipse(0, r * 0.9, r * 0.9, r * 0.35, 0, 0, TAU)
      g.fill()
      g.rotate(rot)
      // glow ring
      g.shadowColor = info.color
      g.shadowBlur = 18
      g.fillStyle = info.color
      g.beginPath()
      g.arc(0, 0, r + 3.5, 0, TAU)
      g.fill()
      g.shadowBlur = 0
      g.drawImage(avatarCanvas(info.avatar, 96), -r, -r, r * 2, r * 2)
      if (id === me) {
        g.strokeStyle = '#ffffff'
        g.lineWidth = 3
        g.setLineDash([6, 5])
        g.lineDashOffset = t * 30
        g.beginPath()
        g.arc(0, 0, r + 9, 0, TAU)
        g.stroke()
        g.setLineDash([])
      }
      g.restore()
      // name tag
      g.save()
      g.globalAlpha = alpha
      g.font = '700 12px Outfit, system-ui, sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      const label = id === me ? `${info.name} (you)` : info.name
      const tw = g.measureText(label).width + 12
      g.fillStyle = 'rgba(8,0,20,0.72)'
      roundRect(g, x - tw / 2, y + r + 7, tw, 17, 8)
      g.fill()
      g.fillStyle = id === me ? '#ffffff' : '#f2e6ff'
      g.fillText(label, x, y + r + 16)
      if (id === me && p.mode !== 'seated' && phase !== 'lobby') {
        const bounce = Math.sin(t * 6) * 3
        g.fillStyle = '#ffe600'
        g.font = '800 13px Outfit, system-ui, sans-serif'
        g.fillText('▼ YOU', x, y - r - 18 + bounce)
      }
      if (p.mode === 'booted' && phase === 'result' && phaseAge < 2.2) {
        g.font = '900 20px Bungee, Impact, sans-serif'
        g.fillStyle = '#ff3c5a'
        g.fillText('BOOTED!', p.x, p.y - r - 24)
      }
      if (p.mode === 'champ') {
        g.font = '64px "Apple Color Emoji","Segoe UI Emoji",sans-serif'
        g.fillText('👑', x, y - r - 30 + Math.sin(t * 4) * 6)
      }
      g.restore()
    }
    // Floating reactions
    for (const rc of this.reactions) {
      const p = pos.get(rc.id)
      if (!p) continue
      const u = rc.age / 1.8
      g.globalAlpha = Math.max(0, 1 - u)
      g.font = '28px "Apple Color Emoji","Segoe UI Emoji",sans-serif'
      g.textAlign = 'center'
      g.fillText(rc.e, p.x + rc.dx * u, p.y - 40 - u * 70)
      g.globalAlpha = 1
    }
    // Where I'm heading (tap/click target)
    const tgt = client.targetPoint?.()
    if (tgt && phase === 'scramble') {
      g.strokeStyle = 'rgba(255,255,255,0.7)'
      g.lineWidth = 2
      g.beginPath()
      g.arc(tgt.x, tgt.y, 10 + Math.sin(t * 10) * 3, 0, TAU)
      g.stroke()
    }
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
      g.fillStyle = p.color
      g.globalAlpha = a
      g.beginPath()
      g.arc(p.x, p.y, p.size * a + 0.5, 0, TAU)
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
