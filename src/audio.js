// Procedural rave soundtrack + sound effects, all synthesised with Web Audio.
// No audio files: nothing to license, nothing to download, and every browser
// can start the same track at the same host-clock moment.
//
// Each track has its own tempo, key, chord progression, bass style, arpeggio and
// a generated lead melody. The arrangement develops in sections (groove ->
// pads + claps -> lead -> breakdown with riser -> big drop) so a round never
// sounds like a single bar on loop. Rounds pick different tracks.

import { rng } from './core.js'

const LOOKAHEAD = 0.14
const TICK_MS = 25

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12)

export const TRACKS = [
  { name: 'Laser Lagoon', bpm: 128, root: 57, prog: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]], bass: 'offbeat', arp: 'up', lead: 'supersaw' },
  { name: 'Midnight Mirrorball', bpm: 124, root: 53, prog: [[0, 3, 7], [5, 8, 12], [-4, 0, 3], [-5, -1, 2]], bass: 'rolling', arp: 'updown', lead: 'square' },
  { name: 'Hyperdrive Disco', bpm: 136, root: 52, prog: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-2, 2, 5]], bass: 'octave', arp: 'skip', lead: 'supersaw' },
  { name: 'Cosmic Conga', bpm: 122, root: 50, prog: [[0, 3, 7], [3, 7, 10], [-2, 2, 5], [5, 8, 12]], bass: 'rolling', arp: 'up', lead: 'pluck' },
  { name: 'Sunset Stomp', bpm: 132, root: 55, prog: [[-4, 0, 3], [-2, 2, 5], [0, 3, 7], [0, 3, 7]], bass: 'offbeat', arp: 'updown', lead: 'supersaw' },
  { name: 'Neon Heartbeat', bpm: 128, root: 54, prog: [[0, 3, 7], [-4, 0, 3], [-7, -3, 0], [-2, 2, 5]], bass: 'octave', arp: 'skip', lead: 'square' },
  // Melodic tracks: hand-written hooks (semitones from root, one per 8th note)
  // and bouncy house-piano chords instead of a generated lead.
  {
    name: 'Friday Feeling', bpm: 124, root: 60, prog: [[0, 4, 7], [-5, -1, 2], [-3, 0, 4], [-7, -3, 0]],
    bass: 'offbeat', arp: 'up', lead: 'pluck', piano: true,
    melody: [[4, null, 7, 4, 12, null, 11, 7], [11, null, 7, 11, 14, null, 12, 11], [12, null, 9, 12, 16, null, 14, 12], [9, null, 12, 9, 7, 5, 4, 2]],
  },
  {
    name: 'Golden Hour Anthem', bpm: 126, root: 62, prog: [[-3, 0, 4], [-7, -3, 0], [0, 4, 7], [-5, -1, 2]],
    bass: 'rolling', arp: 'updown', lead: 'supersaw', piano: true,
    melody: [[9, 12, 16, 12, 9, null, 7, 9], [7, 11, 14, 11, 7, null, 9, 11], [12, null, 11, 9, 7, null, 4, 7], [9, 11, 13, 14, 16, null, 14, 13]],
  },
  {
    name: 'Euphoria Rally', bpm: 138, root: 57, prog: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]],
    bass: 'offbeat', arp: 'skip', lead: 'supersaw',
    melody: [[12, null, 15, 19, 17, 15, 12, 10], [8, null, 12, 15, 12, 8, 7, 8], [15, null, 19, 22, 19, 15, 14, 15], [14, 17, 19, 17, 14, 12, 10, 7]],
  },
]

// Rounds lean towards the melodic tracks: half of all rounds play one of them.
export function roundTrack(seed) {
  const melodic = TRACKS.map((t, i) => (t.melody ? i : -1)).filter((i) => i >= 0)
  const s = Math.abs(seed | 0)
  return s % 2 === 0 ? melodic[(s >> 1) % melodic.length] : (s >> 1) % TRACKS.length
}

// 16-bar arrangement, looped from bar 2. Flags: k kick, h hats, b bass, a arp,
// p pad, c clap, l lead, r riser, s snare roll.
const ARRANGEMENT = [
  'khba', 'khba',
  'khbapc', 'khbapc', 'khbapc', 'khbapc',
  'khbapcl', 'khbapcl', 'khbapcl', 'khbapcl',
  'parh', 'pars',
  'khbapcl', 'khbapcl', 'khbapcl', 'khbapcl',
]

function makeLead(trackIdx, tr) {
  if (tr.melody) return tr.melody
  return generateLead(trackIdx, tr.prog)
}

function generateLead(trackIdx, prog) {
  // One generated 8th-note melody per chord; same every time for a track.
  const rand = rng(1013 + trackIdx * 7919)
  return prog.map((chord) => {
    const tones = [...chord, chord[0] + 12, chord[1] + 12]
    const bar = []
    for (let i = 0; i < 8; i++) {
      const rest = i > 0 && rand() < 0.22
      bar.push(rest ? null : tones[Math.floor(rand() * tones.length)] + 12)
    }
    return bar
  })
}

export class SoundEngine {
  constructor() {
    this.ctx = null
    this.muted = false
    this.playing = null
    this.timer = null
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {})
      return this.ctx
    }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    const ctx = (this.ctx = new AC())
    this.master = ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.8
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -12
    comp.ratio.value = 4
    this.master.connect(comp).connect(ctx.destination)

    // Shared FX: a short plate-ish reverb and a dotted-8th delay.
    this.reverb = ctx.createConvolver()
    this.reverb.buffer = this.impulse(2.4)
    const rvGain = ctx.createGain()
    rvGain.gain.value = 0.35
    this.reverb.connect(rvGain).connect(this.master)
    this.delay = ctx.createDelay(1)
    const fb = ctx.createGain()
    fb.gain.value = 0.38
    const dlGain = ctx.createGain()
    dlGain.gain.value = 0.3
    this.delay.connect(fb).connect(this.delay)
    this.delay.connect(dlGain).connect(this.master)

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = this.noise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1

    this.sfxBus = ctx.createGain()
    this.sfxBus.gain.value = 0.9
    this.sfxBus.connect(this.master)
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return ctx
  }

  impulse(sec) {
    const ctx = this.ctx
    const len = Math.floor(ctx.sampleRate * sec)
    const buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c)
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3)
    }
    return buf
  }

  setMuted(m) {
    this.muted = m
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05)
  }

  // --- Song playback -----------------------------------------------------------

  // Start track `trackId` so that its first downbeat lands at local wall-clock
  // time `startWall` (ms). If that moment has already passed (late joiner, slow
  // device) we jump straight to the right step to stay in sync.
  play(trackId, startWall) {
    const ctx = this.ensure()
    if (!ctx) return
    this.stop(false)
    const idx = ((trackId % TRACKS.length) + TRACKS.length) % TRACKS.length
    const tr = TRACKS[idx]
    const bus = ctx.createGain()
    bus.gain.value = 1
    bus.connect(this.master)
    const duck = ctx.createGain() // sidechain-style pump for bass + pads
    duck.connect(bus)
    const stepDur = 60 / tr.bpm / 4
    const t0 = ctx.currentTime + (startWall - Date.now()) / 1000
    let step = 0
    if (t0 < ctx.currentTime) step = Math.ceil((ctx.currentTime - t0) / stepDur)
    this.playing = { tr, idx, bus, duck, stepDur, t0, step, lead: makeLead(idx, tr), startWall }
    const tick = () => this.schedule()
    tick()
    this.timer = setInterval(tick, TICK_MS)
  }

  schedule() {
    const s = this.playing
    if (!s) return
    const ctx = this.ctx
    while (s.t0 + s.step * s.stepDur < ctx.currentTime + LOOKAHEAD) {
      const t = Math.max(ctx.currentTime, s.t0 + s.step * s.stepDur)
      this.playStep(s, s.step, t)
      s.step++
    }
  }

  playStep(s, step, t) {
    const { tr, stepDur } = s
    const bar = Math.floor(step / 16)
    const st = step % 16
    const sec = bar < ARRANGEMENT.length ? ARRANGEMENT[bar] : ARRANGEMENT[2 + ((bar - 2) % (ARRANGEMENT.length - 2))]
    const chord = tr.prog[bar % tr.prog.length]
    const root = tr.root
    const has = (f) => sec.includes(f)

    if (has('k') && st % 4 === 0) {
      this.kick(t, s.bus)
      s.duck.gain.cancelScheduledValues(t)
      s.duck.gain.setValueAtTime(0.25, t)
      s.duck.gain.linearRampToValueAtTime(1, t + stepDur * 3)
    }
    if (has('c') && (st === 4 || st === 12)) this.clap(t, s.bus)
    if (has('h')) {
      if (st % 4 === 2) this.hat(t, s.bus, 0.13, 0.22)
      else if (st % 2 === 1) this.hat(t, s.bus, 0.035, 0.08)
    }
    if (has('s')) {
      // Accelerating snare roll into the drop.
      const every = st < 8 ? 4 : st < 12 ? 2 : 1
      if (st % every === 0) this.snare(t, s.bus, 0.12 + st * 0.02)
    }
    if (has('r') && st === 0) this.riser(t, stepDur * 32, s.bus)

    if (has('b')) {
      let n = null
      if (tr.bass === 'offbeat' && st % 4 === 2) n = chord[0]
      else if (tr.bass === 'rolling' && st % 4 !== 0) n = chord[0]
      else if (tr.bass === 'octave' && st % 2 === 1) n = chord[0] + (st % 4 === 3 ? 12 : 0)
      if (n !== null) this.bass(t, midi(root - 24 + n), stepDur * 0.9, s.duck)
    }
    if (has('a') && st % 2 === 0) {
      const tones = [chord[0], chord[1], chord[2], chord[0] + 12]
      const i = st / 2
      let seq
      if (tr.arp === 'updown') seq = [0, 1, 2, 3, 2, 1, 0, 1]
      else if (tr.arp === 'skip') seq = [0, 2, 1, 3, 0, 2, 3, 1]
      else seq = [0, 1, 2, 3, 0, 1, 2, 3]
      this.pluck(t, midi(root + 12 + tones[seq[i % 8]]), stepDur * 1.6, s.bus, 0.09)
    }
    if (has('p') && st === 0) {
      for (const n of chord) this.pad(t, midi(root + n), stepDur * 16, s.duck)
    }
    // House piano: syncopated chord stabs (the "and" of beats, plus a push).
    if (tr.piano && has('b') && [2, 6, 10, 13].includes(st)) {
      for (const n of chord) this.piano(t, midi(root + 12 + n), stepDur * 3, s.bus)
    }
    if (has('l') && st % 2 === 0) {
      const mel = s.lead[bar % s.lead.length]
      const n = mel[st / 2]
      if (n !== null) {
        const f = midi(root + n)
        if (tr.lead === 'supersaw') this.supersaw(t, f, stepDur * 1.8, s.bus)
        else if (tr.lead === 'square') this.squareLead(t, f, stepDur * 1.7, s.bus)
        else this.pluck(t, f, stepDur * 2.5, s.bus, 0.16)
      }
    }
  }

  // Abrupt "record scratch" stop — the moment everyone has to run.
  stop(scratch = true) {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    const s = this.playing
    this.playing = null
    if (!s || !this.ctx) return
    const t = this.ctx.currentTime
    s.bus.gain.cancelScheduledValues(t)
    s.bus.gain.setValueAtTime(s.bus.gain.value, t)
    s.bus.gain.linearRampToValueAtTime(0, t + 0.08)
    setTimeout(() => { try { s.bus.disconnect() } catch {} }, 1500)
    if (scratch) this.scratch()
  }

  // 0..1 kick pulse for visuals, derived from the song clock.
  pulse(nowWall) {
    const s = this.playing
    if (!s) return 0
    const beat = (s.stepDur * 4) * 1000
    const since = nowWall - s.startWall
    if (since < 0) return 0
    const bar = Math.floor(since / (beat * 4))
    const sec = bar < ARRANGEMENT.length ? ARRANGEMENT[bar] : ARRANGEMENT[2 + ((bar - 2) % (ARRANGEMENT.length - 2))]
    if (!sec.includes('k')) return 0.15
    const ph = (since % beat) / beat
    return Math.exp(-ph * 6)
  }

  trackName() {
    return this.playing ? this.playing.tr.name : ''
  }

  // --- Instruments -----------------------------------------------------------------

  env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + a)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  }

  kick(t, out) {
    const ctx = this.ctx
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.setValueAtTime(160, t)
    o.frequency.exponentialRampToValueAtTime(42, t + 0.13)
    this.env(g, t, 0.002, 1.1, 0.42)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + 0.45)
  }

  noiseHit(t, out, type, freq, q, peak, dur) {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    this.env(g, t, 0.001, peak, dur)
    src.connect(f).connect(g).connect(out)
    src.start(t, Math.random() * 0.5)
    src.stop(t + dur + 0.02)
    return g
  }

  hat(t, out, dur, peak) {
    this.noiseHit(t, out, 'highpass', 8000, 0.8, peak, dur)
  }

  clap(t, out) {
    for (let i = 0; i < 3; i++) this.noiseHit(t + i * 0.011, out, 'bandpass', 1500, 1.4, 0.5, 0.05)
    const g = this.noiseHit(t + 0.033, out, 'bandpass', 1300, 1.1, 0.45, 0.22)
    g.connect(this.reverb)
  }

  snare(t, out, peak) {
    this.noiseHit(t, out, 'bandpass', 2200, 0.9, peak, 0.1)
  }

  riser(t, dur, out) {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.Q.value = 3
    f.frequency.setValueAtTime(300, t)
    f.frequency.exponentialRampToValueAtTime(9000, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.35, t + dur * 0.95)
    g.gain.linearRampToValueAtTime(0, t + dur)
    src.connect(f).connect(g).connect(out)
    g.connect(this.reverb)
    src.start(t)
    src.stop(t + dur)
  }

  bass(t, f, dur, out) {
    const ctx = this.ctx
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = f
    const o2 = ctx.createOscillator()
    o2.type = 'square'
    o2.frequency.value = f / 2
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = 6
    lp.frequency.setValueAtTime(1400, t)
    lp.frequency.exponentialRampToValueAtTime(180, t + dur)
    const g = ctx.createGain()
    this.env(g, t, 0.004, 0.32, dur)
    o.connect(lp)
    o2.connect(lp)
    lp.connect(g).connect(out)
    o.start(t); o2.start(t)
    o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05)
  }

  pluck(t, f, dur, out, peak) {
    const ctx = this.ctx
    const o = ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.value = f
    const o2 = ctx.createOscillator()
    o2.type = 'square'
    o2.frequency.value = f * 1.003
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(5000, t)
    lp.frequency.exponentialRampToValueAtTime(600, t + dur)
    const g = ctx.createGain()
    this.env(g, t, 0.003, peak, dur)
    o.connect(lp); o2.connect(lp)
    lp.connect(g).connect(out)
    g.connect(this.delay)
    o.start(t); o2.start(t)
    o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05)
  }

  pad(t, f, dur, out) {
    const ctx = this.ctx
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(600, t)
    lp.frequency.linearRampToValueAtTime(2200, t + dur * 0.5)
    lp.frequency.linearRampToValueAtTime(900, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.05, t + 0.25)
    g.gain.setValueAtTime(0.05, t + dur - 0.2)
    g.gain.linearRampToValueAtTime(0.0001, t + dur)
    lp.connect(g).connect(out)
    g.connect(this.reverb)
    for (const det of [-9, 9]) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = f
      o.detune.value = det
      o.connect(lp)
      o.start(t)
      o.stop(t + dur + 0.05)
    }
  }

  supersaw(t, f, dur, out) {
    const ctx = this.ctx
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(6500, t)
    lp.frequency.exponentialRampToValueAtTime(1800, t + dur)
    const g = ctx.createGain()
    this.env(g, t, 0.006, 0.075, dur)
    lp.connect(g).connect(out)
    g.connect(this.delay)
    g.connect(this.reverb)
    for (const det of [-22, -11, 0, 11, 22]) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = f
      o.detune.value = det
      o.connect(lp)
      o.start(t)
      o.stop(t + dur + 0.05)
    }
  }

  piano(t, f, dur, out) {
    const ctx = this.ctx
    const g = ctx.createGain()
    this.env(g, t, 0.003, 0.07, dur + 0.25)
    g.connect(out)
    g.connect(this.reverb)
    // Bright attack (triangle + a touch of the 2nd/3rd harmonic) that decays fast.
    for (const [mult, type, lvl] of [[1, 'triangle', 1], [2, 'sine', 0.35], [3, 'sine', 0.12]]) {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = f * mult
      const og = ctx.createGain()
      og.gain.value = lvl
      o.connect(og).connect(g)
      o.start(t)
      o.stop(t + dur + 0.3)
    }
  }

  squareLead(t, f, dur, out) {
    const ctx = this.ctx
    const o = ctx.createOscillator()
    o.type = 'square'
    o.frequency.setValueAtTime(f * 0.98, t)
    o.frequency.exponentialRampToValueAtTime(f, t + 0.04)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 3200
    const g = ctx.createGain()
    this.env(g, t, 0.005, 0.11, dur)
    o.connect(lp).connect(g).connect(out)
    g.connect(this.delay)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  // --- Sound effects -------------------------------------------------------------------

  sfx(name) {
    const ctx = this.ensure()
    if (!ctx) return
    const t = ctx.currentTime + 0.01
    const out = this.sfxBus
    const tone = (type, f0, f1, dur, peak, at = 0) => {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.setValueAtTime(f0, t + at)
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + at + dur)
      const g = ctx.createGain()
      this.env(g, t + at, 0.005, peak, dur)
      o.connect(g).connect(out)
      o.start(t + at)
      o.stop(t + at + dur + 0.05)
    }
    switch (name) {
      case 'tick': tone('sine', 880, 880, 0.12, 0.3); break
      case 'go': tone('square', 660, 1320, 0.35, 0.25); tone('sine', 1320, 1320, 0.4, 0.2, 0.05); break
      case 'sit': tone('triangle', 520, 1040, 0.12, 0.4); tone('sine', 1560, 1560, 0.18, 0.2, 0.06); break
      case 'other-sit': tone('sine', 700, 900, 0.08, 0.12); break
      case 'boot': // the sad trombone
        tone('sawtooth', 392, 370, 0.32, 0.18)
        tone('sawtooth', 370, 349, 0.32, 0.18, 0.34)
        tone('sawtooth', 349, 330, 0.32, 0.18, 0.68)
        tone('sawtooth', 330, 262, 0.9, 0.2, 1.02)
        break
      case 'kick-out': tone('sine', 300, 60, 0.25, 0.5); break
      case 'win':
        [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone('square', f, f, 0.18, 0.15, i * 0.12))
        tone('sawtooth', 1047, 1047, 0.9, 0.12, 0.72)
        break
      case 'join': tone('sine', 660, 990, 0.15, 0.2); break
      case 'denied': tone('square', 200, 140, 0.15, 0.15); break
    }
  }

  scratch() {
    const ctx = this.ensure()
    if (!ctx) return
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.Q.value = 4
    f.frequency.setValueAtTime(3500, t)
    f.frequency.exponentialRampToValueAtTime(400, t + 0.12)
    f.frequency.exponentialRampToValueAtTime(2500, t + 0.2)
    f.frequency.exponentialRampToValueAtTime(200, t + 0.42)
    const g = ctx.createGain()
    this.env(g, t, 0.005, 0.9, 0.45)
    src.connect(f).connect(g).connect(this.sfxBus)
    src.start(t)
    src.stop(t + 0.5)
    // A falling "tape stop" tone underneath.
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(220, t)
    o.frequency.exponentialRampToValueAtTime(30, t + 0.5)
    const g2 = ctx.createGain()
    this.env(g2, t, 0.005, 0.25, 0.5)
    o.connect(g2).connect(this.sfxBus)
    o.start(t)
    o.stop(t + 0.55)
  }
}
