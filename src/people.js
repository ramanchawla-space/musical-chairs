// People: every player is a man or a woman (their choice), drawn as a
// shaded, fully posed figure: walking, dancing, running, sitting on a chair.
// An avatar key is 'm0'..'m7' or 'w0'..'w7' (a body + look), optionally
// followed by '|<photo data URL>' to put the player's own face on it.

export const MEN = [
  { skin: '#f1cfae', hair: '#3b2416', top: '#2f6fd1', bottom: '#2b2f3a', style: 'short', name: 'Blue shirt' },
  { skin: '#c98e60', hair: '#141010', top: '#d8453c', bottom: '#1d2230', style: 'fade', beard: true, name: 'Red tee' },
  { skin: '#8a5634', hair: '#0d0a08', top: '#f2f2f2', bottom: '#3a3f4f', style: 'buzz', name: 'White shirt' },
  { skin: '#e8b48a', hair: '#b87a3d', top: '#2e9e6a', bottom: '#4a3a2a', style: 'quiff', name: 'Green polo' },
  { skin: '#5b3720', hair: '#0b0908', top: '#f0b429', bottom: '#22262f', style: 'fade', beard: true, name: 'Yellow tee' },
  { skin: '#f6d7bd', hair: '#d9b26a', top: '#7b4fc9', bottom: '#30343d', style: 'side', name: 'Purple shirt' },
  { skin: '#b07448', hair: '#2a1a10', top: '#1f8fa3', bottom: '#d9d2c3', style: 'short', name: 'Teal & chinos' },
  { skin: '#d9a37a', hair: '#8a8a8a', top: '#a23b5a', bottom: '#26292f', style: 'side', beard: true, name: 'Silver fox' },
]
export const WOMEN = [
  { skin: '#f3d0b0', hair: '#5a3420', top: '#e0457b', bottom: '#2b2d42', style: 'long', name: 'Pink top' },
  { skin: '#8d5a36', hair: '#120c09', top: '#f5c242', bottom: '#f5c242', style: 'curly', dress: true, name: 'Gold dress' },
  { skin: '#e9b98f', hair: '#c9893f', top: '#3f8fe0', bottom: '#e9e4da', style: 'pony', name: 'Blue top' },
  { skin: '#5c3a22', hair: '#0b0806', top: '#9b59d0', bottom: '#9b59d0', style: 'bun', dress: true, name: 'Violet dress' },
  { skin: '#f7dcc6', hair: '#e3c27a', top: '#2fae8a', bottom: '#30333c', style: 'bob', name: 'Green top' },
  { skin: '#c68a5c', hair: '#2b1810', top: '#e0603a', bottom: '#e0603a', style: 'long', dress: true, name: 'Coral dress' },
  { skin: '#d29a6e', hair: '#6a2c1a', top: '#1d1d24', bottom: '#c23a4a', style: 'bob', name: 'Red skirt' },
  { skin: '#b47a50', hair: '#1b1210', top: '#f2f2f2', bottom: '#2f5fa0', style: 'pony', jeans: true, name: 'Jeans' },
]

export const LOOK_KEYS = [...MEN.map((_, i) => 'm' + i), ...WOMEN.map((_, i) => 'w' + i)]

// avatar key -> { woman, look, photo }
export function parseAvatar(avatar) {
  // a ready-made look (beach spectators): { woman, look }
  if (avatar && typeof avatar === 'object') return { woman: !!avatar.woman, look: avatar.look, photo: null, body: '' }
  const s = typeof avatar === 'string' ? avatar : ''
  const bar = s.indexOf('|')
  const body = bar >= 0 ? s.slice(0, bar) : s
  const photo = bar >= 0 && s.slice(bar + 1).startsWith('data:image') ? s.slice(bar + 1) : null
  let woman = body[0] === 'w'
  let i = parseInt(body.slice(1), 10)
  if (!/^[mw]\d+$/.test(body)) {
    // older saves / unknown keys: pick a stable look from the string
    let h = 0
    for (let k = 0; k < s.length && k < 64; k++) h = (h * 31 + s.charCodeAt(k)) >>> 0
    woman = h % 2 === 1
    i = h >> 1
  }
  const list = woman ? WOMEN : MEN
  return { woman, look: list[((i % list.length) + list.length) % list.length], photo, body }
}

const photoCache = new Map()
function photoImage(src) {
  let img = photoCache.get(src)
  if (!img) {
    if (photoCache.size > 80) photoCache.clear()
    img = new Image()
    img.src = src
    photoCache.set(src, img)
  }
  return img.complete && img.naturalWidth ? img : null
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16)
  let r = (n >> 16) & 255
  let g = (n >> 8) & 255
  let b = n & 255
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f }
  return `rgb(${r | 0},${g | 0},${b | 0})`
}

function limb(g, x0, y0, x1, y1, w, color) {
  g.strokeStyle = color
  g.lineWidth = w
  g.beginPath()
  g.moveTo(x0, y0)
  g.lineTo(x1, y1)
  g.stroke()
}

// Draw a person standing (or sitting) with their feet at (x, y) on screen,
// `h` pixels tall. pose: { walk (radians), stride 0..1,
// arms 'swing'|'dance'|'up'|'cheer'|'clap'|'drink', beat (radians), seated,
// lean -1..1, drink: 'cocktail'|'beer'|'coconut' (held in the right hand),
// sip 0..1 (how far the drink is raised to the mouth) }
//
// Beach looks add: shorts, bare (shirtless), tank, bikini, sarong, sandals,
// hat 'straw'|'cap'|'sun', shades.
export function drawPerson(g, avatar, x, y, h, pose = {}) {
  const { woman, look, photo } = parseAvatar(avatar)
  const walk = pose.walk || 0
  const stride = pose.stride ?? 0
  const seated = !!pose.seated
  g.save()
  g.translate(x, y)
  g.scale(h, h)
  if (pose.lean) g.rotate(pose.lean * 0.08)
  g.lineCap = 'round'
  g.lineJoin = 'round'

  const skin = look.skin
  const skinD = shade(skin, -0.18)
  const sw = woman ? 0.1 : 0.118 // half shoulder width
  const hip = woman ? 0.1 : 0.088
  // Seated: the whole upper body drops onto the chair seat.
  const drop = seated ? 0.24 : 0
  const bob = seated ? 0 : Math.abs(Math.sin(walk)) * 0.012 * stride
  const Y = (v) => v + drop - bob

  // --- legs
  const legW = woman ? 0.05 : 0.058
  const pants = look.bottom
  const lift = (s) => Math.max(0, s) * 0.06 * stride
  const shoe = look.sandals ? '#b07a45' : woman ? '#3a2228' : '#1b1a1f'
  const bareLegs = (woman && !look.jeans) || look.shorts
  if (seated) {
    // thighs come towards us, shins drop to the floor in front of the seat
    for (const sx of [-1, 1]) {
      const kx = sx * 0.055
      const legColor = bareLegs ? skin : pants
      limb(g, kx, -0.27, kx * 1.05, -0.02, legW, legColor)
      g.fillStyle = shoe
      g.beginPath()
      g.ellipse(kx * 1.05, -0.012, 0.04, 0.022, 0, 0, Math.PI * 2)
      g.fill()
    }
    // lap
    g.fillStyle = woman && (look.dress || !look.jeans) ? look.bottom : shade(pants, 0.08)
    g.beginPath()
    g.ellipse(0, -0.27, hip + 0.03, 0.055, 0, 0, Math.PI * 2)
    g.fill()
  } else {
    for (const [sx, ph] of [[-1, walk], [1, walk + Math.PI]]) {
      const up = lift(Math.sin(ph))
      const fx = sx * 0.05 + Math.cos(ph) * 0.012 * stride
      const hx = sx * 0.045
      const knee = -0.25 - up * 0.5
      const legColor = bareLegs ? skin : pants
      limb(g, hx, Y(-0.5), fx * 0.95, knee, legW, legColor)
      limb(g, fx * 0.95, knee, fx, -0.03 - up, legW * 0.92, legColor)
      if (look.shorts) {
        // board shorts / beach shorts: down to just above the knee
        const kx2 = hx + (fx * 0.95 - hx) * 0.62
        const ky2 = Y(-0.5) + (knee - Y(-0.5)) * 0.62
        limb(g, hx, Y(-0.52), kx2, ky2, legW * 1.35, pants)
        if (look.print) {
          g.fillStyle = look.print
          g.beginPath()
          g.arc((hx + kx2) / 2, (Y(-0.5) + ky2) / 2, legW * 0.28, 0, Math.PI * 2)
          g.fill()
        }
      } else if (!woman || look.jeans) {
        // trouser shading down the inside of each leg
        limb(g, hx + sx * legW * 0.25, Y(-0.48), fx + sx * legW * 0.25, -0.05 - up, legW * 0.3, shade(pants, -0.2))
      }
      g.fillStyle = shoe
      g.beginPath()
      g.ellipse(fx, -0.018 - up, woman ? 0.034 : 0.042, 0.022, 0, 0, Math.PI * 2)
      g.fill()
    }
  }

  // --- hair behind the head (long styles)
  const hy = Y(-0.895)
  if (woman && (look.style === 'long' || look.style === 'curly')) {
    g.fillStyle = shade(look.hair, -0.1)
    g.beginPath()
    const len = look.style === 'long' ? 0.27 : 0.17
    g.moveTo(-0.08, hy - 0.04)
    g.quadraticCurveTo(-0.115, hy + len * 0.6, -0.09, hy + len)
    g.lineTo(0.09, hy + len)
    g.quadraticCurveTo(0.115, hy + len * 0.6, 0.08, hy - 0.04)
    g.closePath()
    g.fill()
  }

  // --- torso
  const shY = Y(-0.79)
  const waistY = Y(-0.55)
  const bareTop = look.bare || look.bikini
  const torsoCol = bareTop ? skin : look.top
  const tg = g.createLinearGradient(-sw, 0, sw, 0)
  tg.addColorStop(0, shade(torsoCol, -0.28))
  tg.addColorStop(0.45, shade(torsoCol, 0.12))
  tg.addColorStop(1, shade(torsoCol, -0.35))
  g.fillStyle = tg
  g.beginPath()
  g.moveTo(-sw, shY + 0.02)
  g.quadraticCurveTo(-sw, shY - 0.012, -sw + 0.03, shY - 0.012)
  g.lineTo(sw - 0.03, shY - 0.012)
  g.quadraticCurveTo(sw, shY - 0.012, sw, shY + 0.02)
  if (woman) {
    g.quadraticCurveTo(sw - 0.01, waistY - 0.08, sw * 0.72, waistY)
    g.lineTo(-sw * 0.72, waistY)
    g.quadraticCurveTo(-sw + 0.01, waistY - 0.08, -sw, shY + 0.02)
  } else {
    g.lineTo(sw * 0.82, waistY + 0.04)
    g.lineTo(-sw * 0.82, waistY + 0.04)
  }
  g.closePath()
  g.fill()
  if (look.print && !bareTop) {
    // a loud holiday-shirt print
    g.fillStyle = look.print
    for (const [px, py] of [[-0.06, 0.05], [0.04, 0.09], [-0.02, 0.15], [0.07, 0.17], [-0.07, 0.2]]) {
      g.beginPath()
      g.arc(px * (sw / 0.118), shY + py, 0.014, 0, Math.PI * 2)
      g.fill()
    }
  }
  if (look.bikini) {
    // bikini top: two cups on thin straps
    g.strokeStyle = look.top
    g.lineWidth = 0.008
    g.beginPath()
    g.moveTo(-0.05, shY + 0.055); g.lineTo(-0.035, shY - 0.01)
    g.moveTo(0.05, shY + 0.055); g.lineTo(0.035, shY - 0.01)
    g.moveTo(-sw * 0.95, shY + 0.075); g.lineTo(sw * 0.95, shY + 0.075)
    g.stroke()
    g.fillStyle = look.top
    for (const sx of [-1, 1]) {
      g.beginPath()
      g.ellipse(sx * 0.04, shY + 0.075, 0.036, 0.03, 0, 0, Math.PI * 2)
      g.fill()
    }
  }
  if (look.bare) {
    // a hint of chest and belly
    g.strokeStyle = shade(skin, -0.22)
    g.lineWidth = 0.005
    g.beginPath()
    g.moveTo(-0.06, shY + 0.07); g.quadraticCurveTo(-0.03, shY + 0.09, 0, shY + 0.075)
    g.moveTo(0.06, shY + 0.07); g.quadraticCurveTo(0.03, shY + 0.09, 0, shY + 0.075)
    g.stroke()
    g.fillStyle = shade(skin, -0.3)
    g.beginPath()
    g.arc(0, waistY - 0.03, 0.006, 0, Math.PI * 2)
    g.fill()
  }
  if (!woman) {
    if (look.tank) {
      // scoop neck
      g.fillStyle = skin
      g.beginPath()
      g.ellipse(0, shY - 0.01, 0.045, 0.05, 0, 0, Math.PI)
      g.fill()
    } else if (!look.bare) {
      // collar + buttons
      g.fillStyle = shade(look.top, 0.3)
      g.beginPath()
      g.moveTo(-0.035, shY - 0.012)
      g.lineTo(0, shY + 0.04)
      g.lineTo(0.035, shY - 0.012)
      g.closePath()
      g.fill()
    }
    // belt (or the shorts' waistband)
    g.fillStyle = look.shorts ? shade(pants, -0.15) : '#1a1410'
    g.fillRect(-sw * 0.82, waistY + 0.03, sw * 1.64, 0.022)
    if (!seated) {
      g.fillStyle = shade(pants, 0.05)
      g.beginPath()
      g.moveTo(-sw * 0.82, waistY + 0.05)
      g.lineTo(sw * 0.82, waistY + 0.05)
      g.lineTo(hip + 0.01, Y(-0.44))
      g.lineTo(-hip - 0.01, Y(-0.44))
      g.closePath()
      g.fill()
    }
  } else {
    // neckline
    g.fillStyle = skin
    g.beginPath()
    g.ellipse(0, shY - 0.005, 0.038, 0.03, 0, 0, Math.PI)
    g.fill()
    if (!seated) {
      // skirt / dress flares out; it swishes with the walk
      const sway = Math.sin(walk) * 0.012 * stride
      const hem = look.jeans ? Y(-0.44) : look.shorts ? Y(-0.4) : look.sarong ? -0.3 : -0.27
      const flare = look.jeans || look.shorts ? hip + 0.015 : hip + 0.06
      const sg = g.createLinearGradient(-flare, 0, flare, 0)
      sg.addColorStop(0, shade(look.bottom, -0.3))
      sg.addColorStop(0.5, shade(look.bottom, 0.1))
      sg.addColorStop(1, shade(look.bottom, -0.3))
      g.fillStyle = sg
      g.beginPath()
      g.moveTo(-sw * 0.72, waistY)
      g.lineTo(sw * 0.72, waistY)
      g.quadraticCurveTo(flare * 0.9, (waistY + hem) / 2, flare + sway, hem)
      g.lineTo(-flare + sway, hem)
      g.quadraticCurveTo(-flare * 0.9, (waistY + hem) / 2, -sw * 0.72, waistY)
      g.closePath()
      g.fill()
    }
    if (look.sarong && !seated) {
      // the sarong's knot at the hip
      g.fillStyle = shade(look.bottom, -0.2)
      g.beginPath()
      g.arc(hip * 0.7, waistY + 0.03, 0.018, 0, Math.PI * 2)
      g.fill()
    }
    if (!look.dress) {
      g.fillStyle = shade(look.bottom, -0.15)
      g.fillRect(-sw * 0.72, waistY - 0.012, sw * 1.44, 0.02)
    }
  }

  // --- arms
  const armW = woman ? 0.04 : 0.048
  const beat = pose.beat || 0
  let cupAt = null
  for (const sx of [-1, 1]) {
    const ax = sx * (sw - 0.012)
    const ay = shY + 0.015
    let hx
    let hyy
    let ex
    let ey
    const holds = pose.drink && sx > 0
    if (pose.arms === 'up') {
      ex = sx * (sw + 0.06); ey = shY - 0.1
      hx = sx * (sw + 0.04); hyy = shY - 0.23
    } else if (pose.arms === 'cheer') {
      // both arms up, waving (a drink raised in a toast if they have one)
      const wv = Math.sin(beat * 2 + (sx > 0 ? 0 : 1.3))
      ex = sx * (sw + 0.07); ey = shY - 0.07
      hx = sx * (sw + 0.05 + wv * 0.035); hyy = shY - 0.22 + Math.abs(wv) * 0.02
    } else if (pose.arms === 'clap') {
      const c = 0.5 + 0.5 * Math.sin(beat * 3)
      ex = sx * (sw + 0.035); ey = shY + 0.12
      hx = sx * (0.012 + c * 0.04); hyy = shY + 0.05
    } else if (holds) {
      // holding a drink, now and then raising it for a sip
      const sip = pose.sip || 0
      ex = sw + 0.045; ey = shY + 0.15 - sip * 0.04
      hx = sw - 0.01 - sip * 0.05; hyy = shY + 0.08 - sip * 0.12
    } else if (pose.arms === 'dance') {
      const raise = (Math.sin(beat + (sx > 0 ? Math.PI : 0)) + 1) / 2
      ex = sx * (sw + 0.07); ey = shY + 0.1 - raise * 0.14
      hx = sx * (sw + 0.03 + raise * 0.02); hyy = shY + 0.2 - raise * 0.36
    } else if (seated) {
      ex = sx * (sw + 0.015); ey = shY + 0.13
      hx = sx * (sw - 0.02); hyy = shY + 0.24
    } else {
      const sw2 = Math.sin(walk + (sx > 0 ? 0 : Math.PI)) * stride
      ex = sx * (sw + 0.02); ey = shY + 0.13
      hx = sx * (sw + 0.025) + sw2 * 0.02; hyy = shY + 0.26 - Math.abs(sw2) * 0.04 - Math.max(0, sw2) * 0.05
    }
    const noSleeve = (woman && look.dress) || look.bare || look.bikini || look.tank
    const sleeve = noSleeve ? skin : look.top
    limb(g, ax, ay, ex, ey, armW, shade(sleeve, -0.12))
    limb(g, ex, ey, hx, hyy, armW * 0.85, skin)
    if (!woman && !noSleeve) limb(g, ax, ay, ax + (ex - ax) * 0.55, ay + (ey - ay) * 0.55, armW * 1.05, shade(look.top, -0.08))
    if (holds) cupAt = { x: hx, y: hyy }
    g.fillStyle = skinD
    g.beginPath()
    g.arc(hx, hyy, armW * 0.55, 0, Math.PI * 2)
    g.fill()
  }
  if (cupAt) drawDrink(g, pose.drink, cupAt.x, cupAt.y)

  // --- neck + head
  g.fillStyle = skinD
  g.fillRect(-0.025, Y(-0.835), 0.05, 0.06)
  const hg = g.createRadialGradient(-0.02, hy - 0.025, 0.01, 0, hy, 0.09)
  hg.addColorStop(0, shade(skin, 0.15))
  hg.addColorStop(1, skinD)
  g.fillStyle = hg
  g.beginPath()
  g.ellipse(0, hy, 0.064, 0.078, 0, 0, Math.PI * 2)
  g.fill()
  // ears
  g.fillStyle = skinD
  for (const sx of [-1, 1]) {
    g.beginPath()
    g.ellipse(sx * 0.064, hy + 0.005, 0.012, 0.02, 0, 0, Math.PI * 2)
    g.fill()
  }
  const img = photo ? photoImage(photo) : null
  if (img) {
    g.save()
    g.beginPath()
    g.ellipse(0, hy + 0.004, 0.06, 0.074, 0, 0, Math.PI * 2)
    g.clip()
    const s = Math.min(img.width, img.height)
    g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, -0.075, hy - 0.075, 0.15, 0.15)
    g.restore()
  } else {
    // face
    g.fillStyle = '#20140f'
    for (const sx of [-1, 1]) {
      g.beginPath()
      g.ellipse(sx * 0.024, hy - 0.002, 0.0075, 0.009, 0, 0, Math.PI * 2)
      g.fill()
    }
    g.strokeStyle = shade(look.hair, -0.2)
    g.lineWidth = 0.007
    for (const sx of [-1, 1]) {
      g.beginPath()
      g.moveTo(sx * 0.012, hy - 0.022)
      g.lineTo(sx * 0.038, hy - 0.025)
      g.stroke()
    }
    g.strokeStyle = shade(skin, -0.32)
    g.lineWidth = 0.006
    g.beginPath()
    g.moveTo(0, hy + 0.005)
    g.lineTo(-0.006, hy + 0.024)
    g.lineTo(0.004, hy + 0.026)
    g.stroke()
    g.strokeStyle = woman ? '#b8384f' : '#7a3a2c'
    g.lineWidth = woman ? 0.009 : 0.007
    g.beginPath()
    g.arc(0, hy + 0.03, 0.02, 0.2 * Math.PI, 0.8 * Math.PI)
    g.stroke()
    if (woman) {
      g.fillStyle = 'rgba(230,90,110,0.22)'
      for (const sx of [-1, 1]) {
        g.beginPath()
        g.arc(sx * 0.038, hy + 0.018, 0.013, 0, Math.PI * 2)
        g.fill()
      }
    }
    if (look.shades) {
      g.fillStyle = '#121418'
      for (const sx of [-1, 1]) {
        g.beginPath()
        g.ellipse(sx * 0.025, hy - 0.004, 0.02, 0.014, 0, 0, Math.PI * 2)
        g.fill()
      }
      g.strokeStyle = '#121418'
      g.lineWidth = 0.006
      g.beginPath()
      g.moveTo(-0.006, hy - 0.008); g.lineTo(0.006, hy - 0.008)
      g.moveTo(-0.045, hy - 0.008); g.lineTo(-0.064, hy - 0.012)
      g.moveTo(0.045, hy - 0.008); g.lineTo(0.064, hy - 0.012)
      g.stroke()
      g.fillStyle = 'rgba(255,255,255,0.35)'
      for (const sx of [-1, 1]) {
        g.beginPath()
        g.ellipse(sx * 0.025 - 0.007, hy - 0.009, 0.006, 0.004, -0.4, 0, Math.PI * 2)
        g.fill()
      }
    }
    if (look.beard) {
      g.fillStyle = shade(look.hair, 0.05)
      const a0 = g.globalAlpha
      g.globalAlpha = a0 * 0.85
      g.beginPath()
      g.moveTo(-0.06, hy + 0.0)
      g.quadraticCurveTo(-0.05, hy + 0.085, 0, hy + 0.085)
      g.quadraticCurveTo(0.05, hy + 0.085, 0.06, hy + 0.0)
      g.quadraticCurveTo(0.03, hy + 0.04, 0, hy + 0.04)
      g.quadraticCurveTo(-0.03, hy + 0.04, -0.06, hy + 0.0)
      g.fill()
      g.globalAlpha = a0
    }
  }

  // --- hair on top
  const hairG = g.createLinearGradient(0, hy - 0.09, 0, hy)
  hairG.addColorStop(0, shade(look.hair, 0.18))
  hairG.addColorStop(1, look.hair)
  g.fillStyle = hairG
  const st = look.style
  g.beginPath()
  if (st === 'buzz') {
    g.ellipse(0, hy - 0.03, 0.066, 0.052, 0, Math.PI, 0)
  } else if (st === 'fade' || st === 'short') {
    g.ellipse(0, hy - 0.035, 0.068, 0.056, 0, Math.PI * 1.02, -0.02 * Math.PI)
    g.lineTo(0.066, hy - 0.01)
    g.lineTo(0.05, hy - 0.04)
    g.lineTo(-0.05, hy - 0.04)
    g.lineTo(-0.066, hy - 0.01)
  } else if (st === 'quiff') {
    g.moveTo(-0.067, hy - 0.01)
    g.quadraticCurveTo(-0.07, hy - 0.085, -0.01, hy - 0.1)
    g.quadraticCurveTo(0.06, hy - 0.11, 0.068, hy - 0.06)
    g.lineTo(0.067, hy - 0.01)
    g.lineTo(0.05, hy - 0.045)
    g.lineTo(-0.05, hy - 0.045)
  } else if (st === 'side') {
    g.moveTo(-0.068, hy)
    g.quadraticCurveTo(-0.075, hy - 0.09, 0, hy - 0.088)
    g.quadraticCurveTo(0.075, hy - 0.085, 0.068, hy - 0.01)
    g.quadraticCurveTo(0.02, hy - 0.06, -0.03, hy - 0.035)
    g.quadraticCurveTo(-0.05, hy - 0.03, -0.068, hy)
  } else if (st === 'bob') {
    g.moveTo(-0.08, hy + 0.06)
    g.quadraticCurveTo(-0.09, hy - 0.1, 0, hy - 0.092)
    g.quadraticCurveTo(0.09, hy - 0.1, 0.08, hy + 0.06)
    g.lineTo(0.058, hy + 0.06)
    g.quadraticCurveTo(0.06, hy - 0.03, 0.02, hy - 0.045)
    g.lineTo(-0.045, hy - 0.035)
    g.quadraticCurveTo(-0.06, hy - 0.02, -0.058, hy + 0.06)
  } else if (st === 'bun' || st === 'pony') {
    g.ellipse(0, hy - 0.035, 0.069, 0.058, 0, Math.PI * 1.02, -0.02 * Math.PI)
    g.lineTo(0.064, hy - 0.005)
    g.quadraticCurveTo(0.03, hy - 0.05, -0.02, hy - 0.048)
    g.quadraticCurveTo(-0.06, hy - 0.04, -0.064, hy - 0.005)
  } else {
    // long / curly: a fringe framing the face
    g.moveTo(-0.075, hy + 0.04)
    g.quadraticCurveTo(-0.085, hy - 0.1, 0, hy - 0.095)
    g.quadraticCurveTo(0.085, hy - 0.1, 0.075, hy + 0.04)
    g.lineTo(0.06, hy + 0.04)
    g.quadraticCurveTo(0.06, hy - 0.035, 0.0, hy - 0.05)
    g.quadraticCurveTo(-0.06, hy - 0.035, -0.06, hy + 0.04)
  }
  g.closePath()
  g.fill()
  if (st === 'bun') {
    g.beginPath()
    g.arc(0, hy - 0.098, 0.03, 0, Math.PI * 2)
    g.fill()
  } else if (st === 'pony') {
    const sway = Math.sin(walk * 1 + 0.5) * 0.02 * Math.max(stride, 0.3)
    g.beginPath()
    g.moveTo(0.04, hy - 0.06)
    g.quadraticCurveTo(0.1 + sway, hy - 0.02, 0.07 + sway, hy + 0.1)
    g.quadraticCurveTo(0.06, hy + 0.02, 0.025, hy - 0.04)
    g.closePath()
    g.fill()
  } else if (st === 'curly') {
    for (let k = 0; k < 9; k++) {
      const a = Math.PI * (1.05 + (k / 8) * 0.9)
      g.beginPath()
      g.arc(Math.cos(a) * 0.075, hy - 0.02 + Math.sin(a) * 0.075, 0.022, 0, Math.PI * 2)
      g.fill()
    }
  }
  if (look.hat) drawHat(g, look.hat, look.hatColor, hy)
  g.restore()
}

function drawHat(g, kind, color, hy) {
  if (kind === 'cap') {
    const c = color || '#e53935'
    g.fillStyle = c
    g.beginPath()
    g.ellipse(0, hy - 0.045, 0.07, 0.05, 0, Math.PI, 0)
    g.fill()
    g.fillStyle = shade(c, -0.25)
    g.beginPath()
    g.ellipse(0.045, hy - 0.045, 0.06, 0.014, 0.1, 0, Math.PI * 2)
    g.fill()
    return
  }
  // straw hat (men) or a wide floppy sun hat (women)
  const wide = kind === 'sun' ? 0.17 : 0.12
  const c = color || (kind === 'sun' ? '#f3e2b3' : '#e2c27a')
  g.fillStyle = shade(c, -0.12)
  g.beginPath()
  g.ellipse(0, hy - 0.05, wide, wide * 0.22, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = c
  g.beginPath()
  g.ellipse(0, hy - 0.07, 0.066, 0.05, 0, Math.PI, 0)
  g.lineTo(0.066, hy - 0.052)
  g.lineTo(-0.066, hy - 0.052)
  g.closePath()
  g.fill()
  g.fillStyle = kind === 'sun' ? '#e0457b' : '#5a3a20'
  g.fillRect(-0.066, hy - 0.075, 0.132, 0.018)
}

// A drink in the hand at (x, y): a cocktail with a paper umbrella, a beer, or a coconut.
function drawDrink(g, kind, x, y) {
  if (kind === 'beer') {
    g.fillStyle = '#6b3d12'
    g.beginPath()
    g.roundRect ? g.roundRect(x - 0.014, y - 0.075, 0.028, 0.085, 0.008) : g.rect(x - 0.014, y - 0.075, 0.028, 0.085)
    g.fill()
    g.fillRect(x - 0.006, y - 0.11, 0.012, 0.04)
    g.fillStyle = '#f2e6c2'
    g.fillRect(x - 0.014, y - 0.05, 0.028, 0.025)
    return
  }
  if (kind === 'coconut') {
    g.fillStyle = '#6d4424'
    g.beginPath()
    g.arc(x, y - 0.03, 0.032, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = '#ff5fa2'
    g.lineWidth = 0.007
    g.beginPath()
    g.moveTo(x + 0.008, y - 0.055)
    g.lineTo(x + 0.03, y - 0.1)
    g.stroke()
    return
  }
  // cocktail: a tall glass of something orange, a slice and a tiny umbrella
  g.fillStyle = 'rgba(255,255,255,0.55)'
  g.beginPath()
  g.moveTo(x - 0.022, y - 0.085)
  g.lineTo(x + 0.022, y - 0.085)
  g.lineTo(x + 0.016, y + 0.005)
  g.lineTo(x - 0.016, y + 0.005)
  g.closePath()
  g.fill()
  g.fillStyle = '#ff8a3d'
  g.beginPath()
  g.moveTo(x - 0.019, y - 0.06)
  g.lineTo(x + 0.019, y - 0.06)
  g.lineTo(x + 0.016, y + 0.002)
  g.lineTo(x - 0.016, y + 0.002)
  g.closePath()
  g.fill()
  g.fillStyle = '#ffd84a'
  g.beginPath()
  g.arc(x + 0.022, y - 0.085, 0.014, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#7a5a3a'
  g.lineWidth = 0.004
  g.beginPath()
  g.moveTo(x - 0.008, y - 0.07)
  g.lineTo(x - 0.022, y - 0.12)
  g.stroke()
  g.fillStyle = '#29b6f6'
  g.beginPath()
  g.moveTo(x - 0.05, y - 0.115)
  g.quadraticCurveTo(x - 0.022, y - 0.15, x + 0.006, y - 0.125)
  g.closePath()
  g.fill()
}

// A portrait thumbnail for the picker / lobby lists.
const thumbCache = new Map()
export function personCanvas(avatar, size = 96) {
  const key = avatar + '@' + size
  const hit = thumbCache.get(key)
  if (hit && !hit.pending) return hit.c
  const c = hit?.c || document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const { look, photo } = parseAvatar(avatar)
  g.clearRect(0, 0, size, size)
  const bg = g.createLinearGradient(0, 0, 0, size)
  bg.addColorStop(0, shade(look.top, 0.55))
  bg.addColorStop(1, shade(look.top, 0.15))
  g.fillStyle = bg
  g.beginPath()
  g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
  g.fill()
  g.save()
  g.beginPath()
  g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
  g.clip()
  drawPerson(g, avatar, size / 2, size * 2.08, size * 2.0, {})
  g.restore()
  const pending = !!photo && !photoImage(photo)
  thumbCache.set(key, { c, pending })
  if (pending) {
    const img = new Image()
    img.onload = () => { photoCache.set(photo, img); personCanvas(avatar, size) }
    img.src = photo
  }
  return c
}
