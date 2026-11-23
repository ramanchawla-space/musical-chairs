// Procedural, easy-going soundtrack + sound effects, all synthesised with
// Web Audio. No audio files: nothing to license, nothing to download, and
// every browser can start the same track at the same host-clock moment.
//
// The palette is deliberately soothing: a soft rounded kick, brushed hats and
// finger snaps, a warm sine bass, mellow pads, electric piano, plucks, bells
// and a breathy flute, all through a gentle low-pass, plate reverb and a
// light echo. Each track runs a 16-bar arrangement (intro -> groove -> hook
// -> a floating breakdown with a soft swell -> back in), looped from bar 2.

import { rng } from './core.js'

const LOOKAHEAD = 0.14
const TICK_MS = 25

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12)

// Track fields:
//   drums: 'four' (soft four-to-the-floor) | 'lazy' (laid-back kick on 1 and the "and" of 3)
//   bass:  'warm' (long sine notes) | 'offbeat' | 'walking'
//   lead:  'keys' (electric piano) | 'pluck' | 'bell' | 'flute'
//   arp:   a quiet shimmering arpeggio of the chord
//   melody: the hook, semitones from root, one per 8th note, one bar per chord
export const TRACKS = [
  {
    name: 'Velvet Lounge', bpm: 108, root: 57, prog: [[0, 4, 7, 11], [-3, 0, 4, 7], [2, 5, 9, 12], [-5, -1, 2, 5]],
    drums: 'lazy', bass: 'warm', lead: 'keys', arp: true,
    melody: [[12, null, 11, null, 7, null, 9, null], [12, null, null, 9, 7, null, 4, null], [14, null, 12, null, 9, null, 12, null], [11, null, 7, null, 5, null, 7, null]],
  },
  {
    name: 'Sunday Glide', bpm: 114, root: 60, prog: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]],
    drums: 'four', bass: 'offbeat', lead: 'pluck', arp: true,
    melody: [[16, null, 14, 12, null, 14, 16, null], [12, null, 11, 9, null, 11, 12, null], [9, null, 7, 5, null, 7, 9, null], [11, null, 12, 14, null, 12, 11, null]],
  },
  {
    name: 'Moonlit Terrace', bpm: 104, root: 55, prog: [[0, 3, 7, 10], [-4, 0, 3, 7], [-2, 2, 5, 9], [-5, -2, 2, 5]],
    drums: 'lazy', bass: 'walking', lead: 'flute',
    melody: [[15, null, null, 14, 12, null, 10, null], [12, null, null, 10, 8, null, 7, null], [14, null, null, 12, 10, null, 9, null], [10, null, 12, null, 14, null, null, null]],
  },
  {
    name: 'Golden Hour', bpm: 118, root: 62, prog: [[0, 4, 7], [-5, -1, 2], [-3, 0, 4], [-7, -3, 0]],
    drums: 'four', bass: 'warm', lead: 'bell', arp: true,
    melody: [[12, null, 16, null, 19, null, 16, null], [11, null, 14, null, 19, null, 14, null], [12, null, 16, null, 21, null, 19, null], [17, null, 16, null, 14, null, 12, null]],
  },
  {
    name: 'Seaside Stroll', bpm: 112, root: 53, prog: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [-5, -1, 2]],
    drums: 'four', bass: 'walking', lead: 'keys',
    melody: [[12, null, 14, 16, null, 14, 12, null], [17, null, 16, 14, null, 12, 14, null], [16, null, 12, 9, null, 12, 16, null], [14, null, 11, 7, null, 11, 14, null]],
  },
  {
    name: 'Lantern Light', bpm: 106, root: 58, prog: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]],
    drums: 'lazy', bass: 'warm', lead: 'bell',
    melody: [[15, null, null, 12, null, null, 10, null], [12, null, null, 8, null, null, 7, null], [15, null, null, 19, null, null, 17, null], [14, null, null, 10, null, null, 12, null]],
  },
  {
    name: 'Friday Feeling', bpm: 120, root: 60, prog: [[0, 4, 7], [-5, -1, 2], [-3, 0, 4], [-7, -3, 0]],
    drums: 'four', bass: 'offbeat', lead: 'pluck', arp: true,
    melody: [[4, null, 7, 4, 12, null, 11, 7], [11, null, 7, 11, 14, null, 12, 11], [12, null, 9, 12, 16, null, 14, 12], [9, null, 12, 9, 7, 5, 4, 2]],
  },
  {
    name: 'Garden Party', bpm: 116, root: 65, prog: [[0, 4, 7, 9], [-3, 0, 4, 7], [-7, -3, 0, 2], [-5, -1, 2, 5]],
    drums: 'four', bass: 'walking', lead: 'flute', arp: true,
    melody: [[7, 9, 12, null, 9, null, 7, null], [4, 7, 9, null, 7, null, 4, null], [5, 7, 9, null, 12, null, 9, null], [7, null, 11, null, 14, null, 12, null]],
  },
  {
    name: 'Slow Dance', bpm: 104, root: 57, prog: [[0, 3, 7], [5, 8, 12], [-4, 0, 3], [-5, -1, 2]],
    drums: 'lazy', bass: 'warm', lead: 'keys', arp: true,
    melody: [[12, null, null, 15, null, null, 14, null], [17, null, null, 15, null, null, 12, null], [8, null, null, 12, null, null, 15, null], [14, null, null, 11, null, null, 7, null]],
  },
]

// The final showdown (one chair left): bright, bouncy and quicker. It skips
// the intro and the breakdown and goes straight into the full groove.
export const FINAL_TRACK = {
  name: 'Final Showdown', bpm: 128, root: 62, prog: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]],
  drums: 'four', bass: 'octave', lead: 'pluck', arp: true, peppy: true,
  arrangement: ['khbpcgl'],
  melody: [[12, 14, 16, null, 19, null, 16, 14], [14, 16, 19, null, 21, null, 19, 16], [16, 19, 21, null, 24, null, 21, 19], [17, 16, 14, null, 12, 14, 16, null]],
}

// Every track has a hook; rounds just rotate through the whole set.
export function roundTrack(seed) {
  const s = Math.abs(seed | 0)
  return s % TRACKS.length
}

// 16-bar arrangement, looped from bar 2. Flags: k kick, h hats, b bass,
// p pad, c snap, g arpeggio, l lead, r soft swell (breakdown).
const ARRANGEMENT = [
  'pb', 'khbp',
  'khbpc', 'khbpcg', 'khbpcg', 'khbpcg',
  'khbpcgl', 'khbpcgl', 'khbpcgl', 'khbpcgl',
  'pgl', 'prgl',
  'khbpcgl', 'khbpcgl', 'khbpcgl', 'khbpcgl',
]

function sectionAt(bar, tr) {
  if (tr?.arrangement) return tr.arrangement[bar % tr.arrangement.length]
  return bar < ARRANGEMENT.length ? ARRANGEMENT[bar] : ARRANGEMENT[2 + ((bar - 2) % (ARRANGEMENT.length - 2))]
}

// Arpeggio shape over a bar of 16ths (index into the chord, or -1 for a rest).
const ARP = [0, -1, 1, -1, 2, -1, 1, -1, 3, -1, 2, -1, 1, -1, 2, -1]

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
    this.master.gain.value = this.muted ? 0 : 0.7
    // A gentle low-pass takes the edge off everything, then soft compression.
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = 6500
    tone.Q.value = 0.5
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -16
    comp.knee.value = 12
    comp.ratio.value = 2.5
    comp.attack.value = 0.02
    comp.release.value = 0.3
    this.master.connect(tone).connect(comp).connect(ctx.destination)

    // Shared FX: a soft plate reverb and a quiet dotted-8th echo.
    this.reverb = ctx.createConvolver()
    this.reverb.buffer = this.impulse(2.8)
    const rvGain = ctx.createGain()
    rvGain.gain.value = 0.32
    this.reverb.connect(rvGain).connect(this.master)
    this.delay = ctx.createDelay(1)
    const fb = ctx.createGain()
    fb.gain.value = 0.3
    const dlGain = ctx.createGain()
    dlGain.gain.value = 0.18
    const dlTone = ctx.createBiquadFilter()
    dlTone.type = 'highpass'
    dlTone.frequency.value = 500
    this.delay.connect(fb).connect(dlTone).connect(this.delay)
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
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.5)
    }
    return buf
  }

  setMuted(m) {
    this.muted = m
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05)
  }

  // --- Song playback -----------------------------------------------------------

  // Start track `trackId` so that its first downbeat lands at local wall-clock
  // time `startWall` (ms). If that moment has already passed (late joiner, slow
  // device) we jump straight to the right step to stay in sync.
  play(trackId, startWall) {
    const ctx = this.ensure()
    if (!ctx) return
    this.stop(false)
    const final = trackId === 'final'
    const idx = final ? -1 : ((trackId % TRACKS.length) + TRACKS.length) % TRACKS.length
    const tr = final ? FINAL_TRACK : TRACKS[idx]
    // bus -> master. Kick goes straight in; everything else goes through
    // `duck`, which breathes very slightly with the kick.
    const bus = ctx.createGain()
    bus.gain.value = 0.9
    bus.connect(this.master)
    const duck = ctx.createGain()
    duck.connect(bus)
    const kickIn = ctx.createGain()
    kickIn.gain.value = 0.6
    kickIn.connect(bus)
    const stepDur = 60 / tr.bpm / 4
    const t0 = ctx.currentTime + (startWall - Date.now()) / 1000
    let step = 0
    if (t0 < ctx.currentTime) step = Math.ceil((ctx.currentTime - t0) / stepDur)
    this.playing = {
      tr, idx, bus, duck, kickIn, stepDur, t0, step, startWall,
      lead: tr.melody,
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
    const sec = sectionAt(bar, tr)
    const chord = tr.prog[bar % tr.prog.length]
    const root = tr.root
    const has = (f) => sec.includes(f)
    const breathe = () => {
      s.duck.gain.cancelScheduledValues(t)
      s.duck.gain.setValueAtTime(0.75, t)
      s.duck.gain.linearRampToValueAtTime(1, t + stepDur * 3)
    }

    // --- drums (soft and round)
    if (has('k')) {
      const lazy = tr.drums === 'lazy'
      if (lazy ? st === 0 || st === 10 : st % 4 === 0) { this.kick(t, s.kickIn, lazy && st === 10 ? 0.7 : 1); breathe() }
    }
    if (has('c') && (st === 4 || st === 12)) {
      this.snap(t, s.bus)
      if (tr.peppy) this.clap(t, s.bus) // a proper handclap on 2 and 4
    }
    if (has('h')) {
      if (st % 4 === 2) this.hat(t, s.bus, tr.peppy ? 0.12 : 0.08, tr.peppy ? 0.09 : 0.06) // offbeat open hat / shaker
      else if (tr.peppy) this.hat(t, s.bus, 0.025, st % 2 ? 0.04 : 0.025) // driving 16ths
      else if (st % 2 === 1) this.hat(t, s.bus, 0.03, 0.025)
    }
    // tambourine shake on the off-beats keeps the final bouncing
    if (tr.peppy && has('k') && (st === 6 || st === 14)) this.hat(t, s.bus, 0.09, 0.05)
    if (has('r') && st === 0) this.swell(t, stepDur * 16, s.bus)

    // --- bass
    if (has('b')) {
      let n = null
      let len = stepDur * 1.6
      if (tr.bass === 'warm') {
        if (st === 0) { n = chord[0]; len = stepDur * 7 }
        else if (st === 8) { n = chord[0]; len = stepDur * 6 }
      } else if (tr.bass === 'octave') {
        // disco octave bounce on every 8th
        if (st % 2 === 0) { n = chord[0] + (st % 4 === 2 ? 12 : 0); len = stepDur * 0.9 }
      } else if (tr.bass === 'offbeat') {
        if (st % 4 === 2) n = chord[0]
      } else if ([0, 4, 8, 12].includes(st)) {
        // walking: root, third, fifth, a step up
        n = [chord[0], chord[1], chord[2], chord[1] + 2][st / 4]
        len = stepDur * 3.5
      }
      if (n !== null) this.bass(t, midi(root - 24 + n), len, s.duck)
    }

    // --- harmony
    if (has('p') && st === 0) {
      for (const n of chord) this.pad(t, midi(root + n), stepDur * 16, s.duck)
    }
    if (tr.arp && has('g') && ARP[st] >= 0) {
      const n = chord[ARP[st] % chord.length] + (ARP[st] >= chord.length ? 12 : 0)
      this.pluck(t, midi(root + 12 + n), stepDur * 1.5, s.duck, 0.025)
    }

    // --- lead
    if (has('l') && st % 2 === 0) {
      const mel = s.lead[bar % s.lead.length]
      const n = mel[st / 2]
      if (n !== null) {
        const f = midi(root + n)
        if (tr.lead === 'keys') this.keys(t, f, stepDur * 3.5, s.duck)
        else if (tr.lead === 'pluck') this.pluck(t, f, stepDur * 2.5, s.duck, 0.075)
        else if (tr.lead === 'bell') this.bell(t, f, stepDur * 5, s.duck)
        else this.flute(t, f, stepDur * 3.2, s.duck)
      }
    }
    // The final stabs bright chords on the off-beats.
    if (tr.peppy && has('b') && (st % 4 === 2)) {
      for (const n of chord) this.pluck(t, midi(root + 12 + n), stepDur * 0.9, s.duck, 0.03)
    }
    // Electric piano tracks comp soft chords under the hook.
    if (tr.lead === 'keys' && has('b') && (st === 0 || st === 6)) {
      for (const n of chord) this.keys(t, midi(root + n), stepDur * 4, s.duck, 0.028)
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
    if (!sectionAt(bar, s.tr).includes('k')) return 0.1
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

  // Soft, rounded kick: a gentle pitch drop with no click.
  kick(t, out, vel = 1) {
    const ctx = this.ctx
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(130, t)
    o.frequency.exponentialRampToValueAtTime(50, t + 0.09)
    o.frequency.exponentialRampToValueAtTime(44, t + 0.35)
    this.env(g, t, 0.004, 0.9 * vel, 0.38)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + 0.42)
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
    this.env(g, t, 0.002, peak, dur)
    src.connect(f).connect(g).connect(out)
    src.start(t, Math.random() * 0.5)
    src.stop(t + dur + 0.02)
    return g
  }

  // Brushed hat / shaker.
  hat(t, out, dur, peak) {
    this.noiseHit(t, out, 'bandpass', 7000, 0.9, peak, dur)
  }

  // Finger snap with a touch of room.
  snap(t, out) {
    const g = this.noiseHit(t, out, 'bandpass', 2200, 2.2, 0.16, 0.09)
    g.connect(this.reverb)
  }

  // A bright handclap: a few quick noise bursts and a little room.
  clap(t, out) {
    for (let i = 0; i < 3; i++) this.noiseHit(t + i * 0.01, out, 'bandpass', 1600, 1.3, 0.22, 0.04)
    const g = this.noiseHit(t + 0.03, out, 'bandpass', 1400, 1.1, 0.18, 0.16)
    g.connect(this.reverb)
  }

  // A soft filtered-noise swell through the breakdown.
  swell(t, dur, out) {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(400, t)
    f.frequency.exponentialRampToValueAtTime(3000, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.05, t + dur * 0.9)
    g.gain.linearRampToValueAtTime(0, t + dur)
    src.connect(f).connect(g).connect(out)
    g.connect(this.reverb)
    src.start(t)
    src.stop(t + dur)
  }

  // Warm bass: a sine with a little triangle for definition.
  bass(t, f, dur, out) {
    const ctx = this.ctx
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 700
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.02)
    g.gain.setTargetAtTime(0.0001, t + dur * 0.7, dur * 0.2)
    lp.connect(g).connect(out)
    this.osc('sine', f, t, t + dur + 0.3, lp)
    const tri = ctx.createGain()
    tri.gain.value = 0.25
    tri.connect(lp)
    this.osc('triangle', f * 2, t, t + dur + 0.3, tri)
  }

  // Mellow pad: soft detuned triangles, slowly opening.
  pad(t, f, dur, out) {
    const ctx = this.ctx
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(700, t)
    lp.frequency.linearRampToValueAtTime(1600, t + dur * 0.5)
    lp.frequency.linearRampToValueAtTime(900, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.03, t + 0.6)
    g.gain.setValueAtTime(0.03, t + dur - 0.4)
    g.gain.linearRampToValueAtTime(0.0001, t + dur)
    lp.connect(g).connect(out)
    g.connect(this.reverb)
    for (const det of [-8, 8]) this.osc('triangle', f, t, t + dur + 0.05, lp, det)
    this.osc('sawtooth', f / 2, t, t + dur + 0.05, lp, 3)
  }

  // Electric piano: a sine "tine" with a decaying bell-like overtone.
  keys(t, f, dur, out, peak = 0.07) {
    const ctx = this.ctx
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + 0.006)
    g.gain.exponentialRampToValueAtTime(peak * 0.4, t + 0.3)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6)
    g.connect(out)
    g.connect(this.reverb)
    // FM: a modulator at 1x gives the warm Rhodes bark, fading fast.
    const car = this.osc('sine', f, t, t + dur + 0.7, g)
    const mod = ctx.createOscillator()
    mod.frequency.setValueAtTime(f, t)
    const mg = ctx.createGain()
    mg.gain.setValueAtTime(f * 1.2, t)
    mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.5)
    mod.connect(mg).connect(car.frequency)
    mod.start(t)
    mod.stop(t + dur + 0.7)
    const og = ctx.createGain()
    og.gain.setValueAtTime(0.25, t)
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.4)
    og.connect(g)
    this.osc('sine', f * 4, t, t + 0.5, og)
  }

  // Soft pluck: a triangle through a closing low-pass.
  pluck(t, f, dur, out, peak = 0.07) {
    const ctx = this.ctx
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(3200, t)
    lp.frequency.exponentialRampToValueAtTime(500, t + dur)
    const g = ctx.createGain()
    this.env(g, t, 0.004, peak, dur + 0.2)
    lp.connect(g).connect(out)
    g.connect(this.delay)
    g.connect(this.reverb)
    this.osc('triangle', f, t, t + dur + 0.3, lp)
    this.osc('sine', f * 2, t, t + dur + 0.3, lp, 4)
  }

  // Glassy bell: a few inharmonic sine partials ringing out.
  bell(t, f, dur, out) {
    const ctx = this.ctx
    for (const [m, lvl, d] of [[1, 0.06, 1], [2.76, 0.022, 0.5], [5.4, 0.01, 0.3], [2, 0.02, 0.8]]) {
      const g = ctx.createGain()
      this.env(g, t, 0.003, lvl, dur * d + 0.2)
      g.connect(out)
      g.connect(this.reverb)
      this.osc('sine', f * m, t, t + dur * d + 0.3, g)
    }
  }

  // Breathy flute: a sine with slow vibrato and a whisper of air.
  flute(t, f, dur, out) {
    const ctx = this.ctx
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.07, t + 0.08)
    g.gain.setValueAtTime(0.07, t + dur * 0.75)
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.15)
    g.connect(out)
    g.connect(this.reverb)
    const o = this.osc('sine', f, t, t + dur + 0.2, g)
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 4.8
    const lg = ctx.createGain()
    lg.gain.setValueAtTime(0, t)
    lg.gain.linearRampToValueAtTime(f * 0.006, t + 0.3)
    lfo.connect(lg).connect(o.frequency)
    lfo.start(t)
    lfo.stop(t + dur + 0.2)
    const h = ctx.createGain()
    h.gain.value = 0.12
    h.connect(g)
    this.osc('sine', f * 2, t, t + dur + 0.2, h)
    const air = this.noiseHit(t, out, 'bandpass', f * 2, 1.5, 0.012, dur)
    air.connect(this.reverb)
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
      case 'go': tone('triangle', 660, 1320, 0.35, 0.25); tone('sine', 1320, 1320, 0.4, 0.2, 0.05); break
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
        [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.18, 0.2, i * 0.12))
        tone('sine', 1047, 1047, 0.9, 0.18, 0.72)
        break
      case 'join': tone('sine', 660, 990, 0.15, 0.2); break
      case 'lock': tone('triangle', 880, 1320, 0.08, 0.28); tone('sine', 1760, 1760, 0.1, 0.12, 0.05); break
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
    this.env(g, t, 0.005, 0.5, 0.45)
    src.connect(f).connect(g).connect(this.sfxBus)
    src.start(t)
    src.stop(t + 0.5)
    // A falling "tape stop" tone underneath.
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(220, t)
    o.frequency.exponentialRampToValueAtTime(30, t + 0.5)
    const g2 = ctx.createGain()
    this.env(g2, t, 0.005, 0.15, 0.5)
    o.connect(g2).connect(this.sfxBus)
    o.start(t)
    o.stop(t + 0.55)
  }
}
