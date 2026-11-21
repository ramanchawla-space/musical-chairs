// Procedural RAVE soundtrack + sound effects, all synthesised with Web Audio.
// No audio files: nothing to license, nothing to download, and every browser
// can start the same track at the same host-clock moment.
//
// The instruments are the classic rave toolkit: distorted 909-style kicks,
// chopped breakbeats, squelchy 303 acid lines, the "Dominator" hoover, reese
// bass, rave organ stabs, hardcore piano, trance-gated supersaws, air horns
// and laser zaps. Everything except the kick is sidechain-pumped. Each track
// runs a 16-bar arrangement (intro -> build -> anthem -> breakdown with snare
// roll, siren and riser -> drop with air horn), looped from bar 2.

import { rng } from './core.js'

const LOOKAHEAD = 0.14
const TICK_MS = 25

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12)

// Track fields:
//   drums: 'four' (four-to-the-floor) | 'break' (chopped breakbeat over a kick)
//   bass:  'acid' (303) | 'reese' | 'offbeat' | 'rolling'
//   lead:  'hoover' | 'supersaw' | 'stab' | 'piano'
//   gate:  trance-gated chord pads   acid: extra 303 line on top of the bass
//   melody: the hook, semitones from root, one per 8th note, one bar per chord
export const TRACKS = [
  {
    name: 'Warehouse Hoover', bpm: 140, root: 52, prog: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -2, 2]],
    drums: 'four', bass: 'reese', lead: 'hoover', acid: true,
    melody: [[12, null, null, 12, 15, null, 14, null], [8, null, null, 8, 12, null, 10, null], [10, null, null, 10, 14, null, 12, null], [7, null, null, 7, 10, null, 12, null]],
  },
  {
    name: 'Acid Rain 303', bpm: 134, root: 57, prog: [[0, 3, 7], [0, 3, 7], [-2, 2, 5], [-4, 0, 3]],
    drums: 'four', bass: 'acid', lead: 'stab', gate: true,
    melody: [[12, null, 12, null, null, 10, null, 12], [15, null, 15, null, null, 12, null, 10], [10, null, 10, null, null, 9, null, 10], [8, null, 8, null, 10, null, 12, null]],
  },
  {
    name: 'Hardcore Piano Rush', bpm: 150, root: 57, prog: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]],
    drums: 'break', bass: 'offbeat', lead: 'piano', horn: true,
    melody: [[12, 15, 19, 15, 12, 15, 19, 22], [8, 12, 15, 12, 8, 12, 15, 20], [15, 19, 22, 19, 15, 19, 22, 24], [14, 17, 21, 17, 14, 17, 19, 17]],
  },
  {
    name: 'Euphoria Rally', bpm: 138, root: 57, prog: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]],
    drums: 'four', bass: 'rolling', lead: 'supersaw', gate: true, horn: true,
    melody: [[12, null, 15, 19, 17, 15, 12, 10], [8, null, 12, 15, 12, 8, 7, 8], [15, null, 19, 22, 19, 15, 14, 15], [14, 17, 19, 17, 14, 12, 10, 7]],
  },
  {
    name: 'Reese Riot', bpm: 146, root: 50, prog: [[0, 3, 7], [0, 3, 7], [-4, 0, 3], [-2, 2, 5]],
    drums: 'break', bass: 'reese', lead: 'hoover', horn: true,
    melody: [[12, null, 10, 12, null, 15, null, 12], [12, null, 10, 12, null, 17, 15, null], [8, null, 7, 8, null, 12, null, 8], [10, null, 9, 10, null, 14, 12, 10]],
  },
  {
    name: 'Laser Lagoon', bpm: 136, root: 55, prog: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-2, 2, 5]],
    drums: 'four', bass: 'offbeat', lead: 'supersaw', acid: true,
    melody: [[19, null, 15, 12, 19, null, 22, 19], [17, null, 14, 10, 17, null, 19, 17], [15, null, 12, 8, 15, null, 19, 15], [14, null, 10, 14, 17, null, 14, 12]],
  },
  {
    name: 'Friday Feeling', bpm: 132, root: 60, prog: [[0, 4, 7], [-5, -1, 2], [-3, 0, 4], [-7, -3, 0]],
    drums: 'four', bass: 'offbeat', lead: 'piano', gate: true,
    melody: [[4, null, 7, 4, 12, null, 11, 7], [11, null, 7, 11, 14, null, 12, 11], [12, null, 9, 12, 16, null, 14, 12], [9, null, 12, 9, 7, 5, 4, 2]],
  },
  {
    name: 'Golden Hour Anthem', bpm: 138, root: 62, prog: [[-3, 0, 4], [-7, -3, 0], [0, 4, 7], [-5, -1, 2]],
    drums: 'four', bass: 'rolling', lead: 'supersaw', gate: true, horn: true,
    melody: [[9, 12, 16, 12, 9, null, 7, 9], [7, 11, 14, 11, 7, null, 9, 11], [12, null, 11, 9, 7, null, 4, 7], [9, 11, 13, 14, 16, null, 14, 13]],
  },
  {
    name: 'Mirrorball Mayhem', bpm: 142, root: 53, prog: [[0, 3, 7], [5, 8, 12], [-4, 0, 3], [-5, -1, 2]],
    drums: 'break', bass: 'acid', lead: 'stab', horn: true,
    melody: [[12, null, null, 12, null, null, 15, null], [17, null, null, 17, null, null, 15, null], [8, null, null, 8, null, null, 12, null], [7, null, null, 11, null, null, 14, null]],
  },
]

// Every track has a hook now; rounds just rotate through the whole set.
export function roundTrack(seed) {
  const s = Math.abs(seed | 0)
  return s % TRACKS.length
}

// 16-bar arrangement, looped from bar 2. Flags: k kick, h hats, b bass,
// a acid, p pad, c clap/snare, g gate chords, l lead, r riser + siren,
// s snare roll, x drop (air horn + crash), z laser zaps.
const ARRANGEMENT = [
  'khba', 'khba',
  'khbapc', 'khbapcg', 'khbapcgz', 'khbapcg',
  'khbapcgl', 'khbapcgl', 'khbapcglz', 'khbapcgl',
  'prl', 'prsl',
  'khbapcglx', 'khbapcgl', 'khbapcglz', 'khbapcgl',
]

function sectionAt(bar) {
  return bar < ARRANGEMENT.length ? ARRANGEMENT[bar] : ARRANGEMENT[2 + ((bar - 2) % (ARRANGEMENT.length - 2))]
}

// Breakbeat (amen-flavoured): kicks and snares with ghost notes.
const BREAK_K = { 0: 1, 2: 0.8, 10: 1, 11: 0.6 }
const BREAK_S = { 4: 1, 7: 0.35, 9: 0.45, 12: 1, 14: 0.3, 15: 0.5 }
// Trance gate: which 16ths let the chord through.
const GATE = [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1]

// A 16-step 303 line per track: note (semitones), accent, slide, or a rest.
function acidPattern(trackIdx) {
  const rand = rng(4242 + trackIdx * 131)
  const pool = [0, 0, 0, 12, 0, 3, 7, 10, -2, 12, 5]
  const steps = []
  for (let i = 0; i < 16; i++) {
    if (i > 0 && rand() < 0.2) { steps.push(null); continue }
    steps.push({ n: pool[Math.floor(rand() * pool.length)], acc: rand() < 0.3, slide: rand() < 0.25 })
  }
  steps[0] = { n: 0, acc: true, slide: false }
  return steps
}

function driveCurve(k) {
  const n = 1024
  const c = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    c[i] = Math.tanh(k * x) / Math.tanh(k)
  }
  return c
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
    comp.threshold.value = -10
    comp.knee.value = 6
    comp.ratio.value = 6
    comp.attack.value = 0.003
    comp.release.value = 0.12
    this.master.connect(comp).connect(ctx.destination)

    // Shared FX: a big warehouse reverb and a dotted-8th delay.
    this.reverb = ctx.createConvolver()
    this.reverb.buffer = this.impulse(3.2)
    const rvGain = ctx.createGain()
    rvGain.gain.value = 0.3
    this.reverb.connect(rvGain).connect(this.master)
    this.delay = ctx.createDelay(1)
    const fb = ctx.createGain()
    fb.gain.value = 0.4
    const dlGain = ctx.createGain()
    dlGain.gain.value = 0.28
    const dlTone = ctx.createBiquadFilter()
    dlTone.type = 'highpass'
    dlTone.frequency.value = 500
    this.delay.connect(fb).connect(dlTone).connect(this.delay)
    this.delay.connect(dlGain).connect(this.master)

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = this.noise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1

    this.curves = { soft: driveCurve(1.6), hard: driveCurve(5), acid: driveCurve(3) }

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
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.5)
    }
    return buf
  }

  shaper(curve) {
    const ws = this.ctx.createWaveShaper()
    ws.curve = this.curves[curve]
    ws.oversample = '2x'
    return ws
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
    // bus -> gentle saturation -> master. Kick goes straight in; everything
    // else goes through `duck`, which pumps on every kick (sidechain).
    const bus = ctx.createGain()
    bus.gain.value = 1
    const glue = this.shaper('soft')
    bus.connect(glue).connect(this.master)
    const duck = ctx.createGain()
    duck.connect(bus)
    const kickIn = this.shaper('hard')
    const kickLvl = ctx.createGain()
    kickLvl.gain.value = 0.75
    kickIn.connect(kickLvl).connect(bus)
    const acidIn = this.shaper('acid')
    const acidLvl = ctx.createGain()
    acidLvl.gain.value = 0.5
    acidIn.connect(acidLvl).connect(duck)
    acidLvl.connect(this.delay)
    const stepDur = 60 / tr.bpm / 4
    const t0 = ctx.currentTime + (startWall - Date.now()) / 1000
    let step = 0
    if (t0 < ctx.currentTime) step = Math.ceil((ctx.currentTime - t0) / stepDur)
    this.playing = {
      tr, idx, bus, duck, kickIn, acidIn, stepDur, t0, step, startWall,
      lead: tr.melody, acid: acidPattern(idx), acidPrev: null,
    }
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
    const sec = sectionAt(bar)
    const chord = tr.prog[bar % tr.prog.length]
    const root = tr.root
    const has = (f) => sec.includes(f)
    const pump = () => {
      s.duck.gain.cancelScheduledValues(t)
      s.duck.gain.setValueAtTime(0.22, t)
      s.duck.gain.linearRampToValueAtTime(1, t + stepDur * 3.2)
    }

    // --- drums
    if (has('k')) {
      if (tr.drums === 'break') {
        if (st % 4 === 0) { this.kick(t, s.kickIn, 0.85); pump() }
        if (BREAK_K[st] && st % 4 !== 0) this.kick(t, s.kickIn, BREAK_K[st] * 0.7)
      } else if (st % 4 === 0) {
        this.kick(t, s.kickIn, 1)
        pump()
      }
    }
    if (has('c')) {
      if (tr.drums === 'break') {
        if (BREAK_S[st]) this.snare(t, s.bus, BREAK_S[st])
      } else if (st === 4 || st === 12) this.clap(t, s.bus)
    }
    if (has('h')) {
      if (st % 4 === 2) this.hat(t, s.bus, 0.16, 0.24) // offbeat open hat
      else this.hat(t, s.bus, 0.03, st % 2 ? 0.09 : 0.05)
      if (tr.drums === 'break' && has('k') && st % 8 === 6) this.hat(t, s.bus, 0.35, 0.1, 6000) // ride wash
    }
    if (has('s')) {
      const every = st < 8 ? 4 : st < 12 ? 2 : 1
      if (st % every === 0) this.snare(t, s.bus, 0.25 + st * 0.045)
    }
    if (has('r') && st === 0 && bar % 16 === 10) {
      this.riser(t, stepDur * 32, s.bus)
      this.siren(t, stepDur * 32, midi(root + 12), s.bus)
    }
    if (has('x') && st === 0) {
      this.crash(t, s.bus)
      if (tr.horn) {
        const f = midi(root + 19)
        this.horn(t, f, stepDur * 1.6, s.bus)
        this.horn(t + stepDur * 3, f, stepDur * 1.6, s.bus)
        this.horn(t + stepDur * 6, f, stepDur * 8, s.bus)
      } else this.zap(t, s.bus)
    }
    if (has('z') && (st === 14 || st === 15)) this.zap(t, s.bus)

    // --- bass
    if (has('b')) {
      if (tr.bass === 'acid') this.acidStep(s, st, t, root - 24, bar)
      else if (tr.bass === 'reese') {
        if (st === 0 || st === 8) this.reese(t, midi(root - 24 + chord[0]), stepDur * 7.8, s.duck)
      } else {
        let n = null
        if (tr.bass === 'offbeat' && st % 4 === 2) n = chord[0]
        else if (tr.bass === 'rolling' && st % 4 !== 0) n = chord[0] + (st % 4 === 3 ? 12 : 0)
        if (n !== null) this.bass(t, midi(root - 24 + n), stepDur * 0.9, s.duck)
      }
    }
    if (tr.acid && has('a') && tr.bass !== 'acid') this.acidStep(s, st, t, root - 12, bar)

    // --- harmony
    if (has('p') && st === 0) {
      for (const n of chord) this.pad(t, midi(root + n), stepDur * 16, s.duck)
    }
    if (tr.gate && has('g') && st === 0) this.gateChord(t, chord.map((n) => midi(root + 12 + n)), stepDur, s.duck)

    // --- lead
    if (has('l') && st % 2 === 0) {
      const mel = s.lead[bar % s.lead.length]
      const n = mel[st / 2]
      if (n !== null) {
        const f = midi(root + n)
        // in the breakdown the lead floats on its own, filtered and wet
        const soft = !has('k')
        if (tr.lead === 'hoover') this.hoover(t, f, stepDur * 3.2, s.duck, soft)
        else if (tr.lead === 'stab') this.stab(t, f, stepDur * 2, s.duck, soft)
        else if (tr.lead === 'piano') this.ravePiano(t, f, stepDur * 3, s.duck)
        else this.supersaw(t, f, stepDur * 1.8, s.duck, soft)
      }
    }
    // Hardcore piano also bangs out chord stabs under the hook.
    if (tr.lead === 'piano' && has('b') && [0, 3, 6, 10, 12].includes(st)) {
      for (const n of chord) this.ravePiano(t, midi(root + n), stepDur * 2, s.duck, 0.05)
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
    if (!sectionAt(bar).includes('k')) return 0.15
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

  osc(type, f, t, end, dest, detune = 0) {
    const o = this.ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f, t)
    if (detune) o.detune.value = detune
    o.connect(dest)
    o.start(t)
    o.stop(end)
    return o
  }

  // Punchy distorted 909-ish kick: pitch-swept body + a click on top.
  kick(t, out, vel = 1) {
    const ctx = this.ctx
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.setValueAtTime(240, t)
    o.frequency.exponentialRampToValueAtTime(52, t + 0.07)
    o.frequency.exponentialRampToValueAtTime(44, t + 0.4)
    this.env(g, t, 0.002, 1.4 * vel, 0.45)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + 0.5)
    this.noiseHit(t, out, 'highpass', 3000, 0.7, 0.35 * vel, 0.012)
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

  hat(t, out, dur, peak, freq = 8500) {
    this.noiseHit(t, out, 'highpass', freq, 0.8, peak, dur)
  }

  clap(t, out) {
    for (let i = 0; i < 3; i++) this.noiseHit(t + i * 0.011, out, 'bandpass', 1500, 1.4, 0.55, 0.05)
    const g = this.noiseHit(t + 0.033, out, 'bandpass', 1300, 1.1, 0.5, 0.24)
    g.connect(this.reverb)
  }

  // Breakbeat snare: a tuned body under a crack of noise.
  snare(t, out, vel = 1) {
    const ctx = this.ctx
    const o = ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.setValueAtTime(240, t)
    o.frequency.exponentialRampToValueAtTime(170, t + 0.08)
    const g = ctx.createGain()
    this.env(g, t, 0.001, 0.45 * vel, 0.12)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + 0.15)
    const n = this.noiseHit(t, out, 'bandpass', 2600, 0.7, 0.55 * vel, 0.16)
    if (vel > 0.8) n.connect(this.reverb)
  }

  crash(t, out) {
    const g = this.noiseHit(t, out, 'highpass', 4500, 0.5, 0.35, 1.8)
    g.connect(this.reverb)
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
    f.frequency.exponentialRampToValueAtTime(10000, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.4, t + dur * 0.95)
    g.gain.linearRampToValueAtTime(0, t + dur)
    src.connect(f).connect(g).connect(out)
    g.connect(this.reverb)
    src.start(t)
    src.stop(t + dur)
  }

  // Rave siren: a wailing saw climbing two octaves through the breakdown.
  siren(t, dur, f, out) {
    const ctx = this.ctx
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(f, t)
    o.frequency.exponentialRampToValueAtTime(f * 4, t + dur)
    const lfo = ctx.createOscillator()
    lfo.frequency.setValueAtTime(3, t)
    lfo.frequency.linearRampToValueAtTime(12, t + dur)
    const lg = ctx.createGain()
    lg.gain.value = f * 0.06
    lfo.connect(lg).connect(o.frequency)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1800
    bp.Q.value = 1.2
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.06, t + dur * 0.9)
    g.gain.linearRampToValueAtTime(0, t + dur)
    o.connect(bp).connect(g).connect(out)
    g.connect(this.reverb)
    o.start(t); lfo.start(t)
    o.stop(t + dur); lfo.stop(t + dur)
  }

  // The air horn: three brassy saws through a honky band-pass.
  horn(t, f, dur, out) {
    const ctx = this.ctx
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1300
    bp.Q.value = 1.4
    const sh = this.shaper('hard')
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.015)
    g.gain.setValueAtTime(0.16, t + dur - 0.03)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05)
    bp.connect(sh).connect(g).connect(out)
    g.connect(this.reverb)
    for (const [m, det] of [[1, 0], [1, 14], [1.5, -8], [2, 6]]) {
      const o = this.osc('sawtooth', f * m * 0.94, t, t + dur + 0.1, bp, det)
      o.frequency.exponentialRampToValueAtTime(f * m, t + 0.04)
    }
  }

  zap(t, out) {
    const ctx = this.ctx
    const o = ctx.createOscillator()
    o.type = 'square'
    o.frequency.setValueAtTime(2600, t)
    o.frequency.exponentialRampToValueAtTime(110, t + 0.2)
    const g = ctx.createGain()
    this.env(g, t, 0.002, 0.07, 0.22)
    o.connect(g).connect(out)
    g.connect(this.delay)
    o.start(t)
    o.stop(t + 0.25)
  }

  bass(t, f, dur, out) {
    const ctx = this.ctx
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = 7
    lp.frequency.setValueAtTime(1800, t)
    lp.frequency.exponentialRampToValueAtTime(160, t + dur)
    const g = ctx.createGain()
    this.env(g, t, 0.004, 0.36, dur)
    lp.connect(g).connect(out)
    this.osc('sawtooth', f, t, t + dur + 0.05, lp)
    this.osc('square', f / 2, t, t + dur + 0.05, lp)
  }

  // Reese: detuned saws beating against each other, with a slow filter swell.
  reese(t, f, dur, out) {
    const ctx = this.ctx
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = 3
    lp.frequency.setValueAtTime(220, t)
    lp.frequency.linearRampToValueAtTime(950, t + dur * 0.5)
    lp.frequency.linearRampToValueAtTime(260, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.02)
    g.gain.setValueAtTime(0.3, t + dur - 0.05)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    lp.connect(g).connect(out)
    for (const det of [-16, 16]) this.osc('sawtooth', f, t, t + dur + 0.05, lp, det)
    this.osc('sine', f / 2, t, t + dur + 0.05, g)
  }

  // One step of a TB-303: resonant squelch, accents and slides.
  acidStep(s, st, t, base, bar) {
    const n = s.acid[st]
    if (!n) { s.acidPrev = null; return }
    const ctx = this.ctx
    const f = midi(base + n.n)
    const dur = s.stepDur * (n.slide ? 1.05 : 0.62)
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    if (s.acidPrev && n.slide) {
      o.frequency.setValueAtTime(s.acidPrev, t)
      o.frequency.exponentialRampToValueAtTime(f, t + s.stepDur * 0.5)
    } else o.frequency.setValueAtTime(f, t)
    s.acidPrev = f
    // the filter opens and closes over 8 bars — the classic acid build
    const sweep = 0.5 - 0.5 * Math.cos(((bar % 8) / 8) * Math.PI * 2)
    const cut = 260 + 2200 * sweep
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = 17
    lp.frequency.setValueAtTime(cut * (n.acc ? 4 : 2.2), t)
    lp.frequency.exponentialRampToValueAtTime(cut, t + 0.14)
    const g = ctx.createGain()
    this.env(g, t, 0.003, n.acc ? 0.5 : 0.3, dur)
    o.connect(lp).connect(g).connect(s.acidIn)
    o.start(t)
    o.stop(t + dur + 0.03)
  }

  pad(t, f, dur, out) {
    const ctx = this.ctx
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(600, t)
    lp.frequency.linearRampToValueAtTime(2400, t + dur * 0.5)
    lp.frequency.linearRampToValueAtTime(900, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.045, t + 0.25)
    g.gain.setValueAtTime(0.045, t + dur - 0.2)
    g.gain.linearRampToValueAtTime(0.0001, t + dur)
    lp.connect(g).connect(out)
    g.connect(this.reverb)
    for (const det of [-12, 12]) this.osc('sawtooth', f, t, t + dur + 0.05, lp, det)
  }

  // Trance gate: one sustained supersaw chord per bar, chopped into 16ths.
  gateChord(t, freqs, stepDur, out) {
    const ctx = this.ctx
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 4200
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    GATE.forEach((on, i) => {
      if (!on) return
      const a = t + i * stepDur
      g.gain.setValueAtTime(0.0001, a)
      g.gain.linearRampToValueAtTime(0.05, a + 0.004)
      g.gain.setTargetAtTime(0.0001, a + stepDur * 0.55, 0.012)
    })
    lp.connect(g).connect(out)
    g.connect(this.delay)
    const end = t + stepDur * 16 + 0.05
    for (const f of freqs) for (const det of [-18, 0, 18]) this.osc('sawtooth', f, t, end, lp, det)
  }

  // The "Dominator" hoover: detuned saws that swoop up into the note,
  // with vibrato and a pitch dive on the way out.
  hoover(t, f, dur, out, soft) {
    const ctx = this.ctx
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = 2
    lp.frequency.value = soft ? 1400 : 3400
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.085, t + 0.03)
    g.gain.setValueAtTime(0.085, t + dur * 0.8)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12)
    lp.connect(g).connect(out)
    g.connect(this.reverb)
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 5.5
    const lg = ctx.createGain()
    lg.gain.value = f * 0.014
    lfo.connect(lg)
    lfo.start(t)
    lfo.stop(t + dur + 0.15)
    for (const [m, det, type] of [[1, -32, 'sawtooth'], [1, 0, 'sawtooth'], [1, 32, 'sawtooth'], [0.5, 8, 'square'], [2, -6, 'sawtooth']]) {
      const o = this.osc(type, f * m * 0.7, t, t + dur + 0.15, lp, det)
      o.frequency.exponentialRampToValueAtTime(f * m, t + 0.09)
      o.frequency.setValueAtTime(f * m, t + dur * 0.8)
      o.frequency.exponentialRampToValueAtTime(f * m * 0.55, t + dur + 0.12)
      lg.connect(o.frequency)
    }
  }

  // Rave organ stab: a minor chord with a fast filter snap.
  stab(t, f, dur, out, soft) {
    const ctx = this.ctx
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = 4
    lp.frequency.setValueAtTime(soft ? 2000 : 5500, t)
    lp.frequency.exponentialRampToValueAtTime(450, t + 0.2)
    const g = ctx.createGain()
    this.env(g, t, 0.003, 0.11, dur)
    lp.connect(g).connect(out)
    g.connect(this.reverb)
    g.connect(this.delay)
    for (const n of [0, 3, 7, 12]) {
      const fn = f * Math.pow(2, n / 12)
      this.osc('square', fn, t, t + dur + 0.05, lp)
      this.osc('sawtooth', fn, t, t + dur + 0.05, lp, 9)
    }
  }

  supersaw(t, f, dur, out, soft) {
    const ctx = this.ctx
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(soft ? 2500 : 7000, t)
    lp.frequency.exponentialRampToValueAtTime(1800, t + dur)
    const g = ctx.createGain()
    this.env(g, t, 0.006, 0.075, dur)
    lp.connect(g).connect(out)
    g.connect(this.delay)
    g.connect(this.reverb)
    for (const det of [-25, -12, 0, 12, 25]) this.osc('sawtooth', f, t, t + dur + 0.05, lp, det)
    this.osc('sawtooth', f * 2, t, t + dur + 0.05, lp, 5)
  }

  // Bright hardcore piano: hammer attack, quick decay, soaked in reverb.
  ravePiano(t, f, dur, out, peak = 0.09) {
    const ctx = this.ctx
    const g = ctx.createGain()
    this.env(g, t, 0.002, peak, dur + 0.3)
    g.connect(out)
    g.connect(this.reverb)
    for (const [mult, type, lvl] of [[1, 'triangle', 1], [1, 'square', 0.18], [2, 'sine', 0.4], [3, 'sine', 0.15], [4.01, 'sine', 0.08]]) {
      const og = ctx.createGain()
      og.gain.value = lvl
      og.connect(g)
      this.osc(type, f * mult, t, t + dur + 0.35, og)
    }
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
