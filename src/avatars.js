// Avatars: a gallery of emoji characters on neon gradients, or the player's
// own photo (downscaled to a ~100px JPEG so it travels cheaply over WebRTC).

export const PRESETS = [
  ['🦄', '#ff3cac', '#784ba0'], ['🐯', '#ff8a00', '#e52e71'], ['🐼', '#43e97b', '#38f9d7'],
  ['🦊', '#f7971e', '#ffd200'], ['🐸', '#56ab2f', '#a8e063'], ['🐙', '#ee0979', '#ff6a00'],
  ['🦁', '#f12711', '#f5af19'], ['🐨', '#8e9eab', '#5f72bd'], ['🐵', '#c79081', '#dfa579'],
  ['🐧', '#00c6ff', '#0072ff'], ['🦖', '#11998e', '#38ef7d'], ['🐲', '#fc466b', '#3f5efb'],
  ['👽', '#00f260', '#0575e6'], ['🤖', '#bdc3c7', '#2c3e50'], ['👻', '#a18cd1', '#fbc2eb'],
  ['😎', '#f857a6', '#ff5858'], ['🤠', '#e96443', '#904e95'], ['🥳', '#fa709a', '#fee140'],
  ['🎧', '#4facfe', '#00f2fe'], ['🕺', '#b721ff', '#21d4fd'], ['💃', '#ff0844', '#ffb199'],
  ['🍕', '#f6d365', '#fda085'], ['🌮', '#f093fb', '#f5576c'], ['🍩', '#ff9a9e', '#fecfef'],
]

export function presetKey(i) { return 'p' + i }

const cache = new Map()

// Returns a square canvas (size px) with the avatar drawn in a circle.
export function avatarCanvas(avatar, size = 128) {
  const key = avatar + '@' + size
  if (cache.has(key)) return cache.get(key)
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const drawPreset = (i) => {
    const [emoji, a, b] = PRESETS[i] || PRESETS[0]
    const grad = g.createLinearGradient(0, 0, size, size)
    grad.addColorStop(0, a)
    grad.addColorStop(1, b)
    g.fillStyle = grad
    g.beginPath()
    g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    g.fill()
    g.font = `${Math.round(size * 0.6)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(emoji, size / 2, size / 2 + size * 0.04)
  }
  if (typeof avatar === 'string' && avatar.startsWith('data:image')) {
    drawPreset(0)
    const img = new Image()
    img.onload = () => {
      g.clearRect(0, 0, size, size)
      g.save()
      g.beginPath()
      g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
      g.clip()
      const s = Math.min(img.width, img.height)
      g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size)
      g.restore()
    }
    img.src = avatar
  } else {
    const i = parseInt(String(avatar).slice(1), 10)
    drawPreset(Number.isFinite(i) ? i : 0)
  }
  cache.set(key, c)
  return c
}

// Square-crop and downscale an uploaded photo to a small JPEG data URL.
export function photoToAvatar(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const size = 112
      const c = document.createElement('canvas')
      c.width = c.height = size
      const g = c.getContext('2d')
      const s = Math.min(img.width, img.height)
      g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')) }
    img.src = url
  })
}

// A DOM element for lists/overlays. Photos use <img> so they show once decoded
// (copying the cached canvas would freeze whatever was drawn at that instant).
export function avatarEl(avatar, size = 64) {
  if (typeof avatar === 'string' && avatar.startsWith('data:image')) {
    const img = document.createElement('img')
    img.src = avatar
    img.width = img.height = size
    img.alt = ''
    return img
  }
  const c = document.createElement('canvas')
  c.width = c.height = size
  c.getContext('2d').drawImage(avatarCanvas(avatar, 128), 0, 0, size, size)
  return c
}
