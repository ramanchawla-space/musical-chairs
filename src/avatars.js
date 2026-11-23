// Avatars: each player picks a man or a woman (8 looks each), and can put
// their own photo on the face (downscaled to a ~100px JPEG so it travels
// cheaply over WebRTC). Key format: 'm3', 'w5', or 'w5|data:image/jpeg...'.

import { LOOK_KEYS, MEN, WOMEN, parseAvatar, personCanvas } from './people.js'

export { LOOK_KEYS, parseAvatar }

export function lookName(key) {
  const { woman, look } = parseAvatar(key)
  return (woman ? 'Woman · ' : 'Man · ') + look.name
}

export function randomLook() {
  return LOOK_KEYS[Math.floor(Math.random() * LOOK_KEYS.length)]
}

export function bodyOf(avatar) {
  const { body } = parseAvatar(avatar)
  return /^[mw]\d+$/.test(body) ? body : 'm0'
}

export function withPhoto(body, photo) {
  return photo ? `${body}|${photo}` : body
}

export function photoOf(avatar) {
  return parseAvatar(avatar).photo
}

export const LOOK_COUNTS = { men: MEN.length, women: WOMEN.length }

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

// A DOM element (portrait of the person) for lists and overlays. Photo faces
// decode asynchronously, so those copies redraw once the photo is ready.
export function avatarEl(avatar, size = 64) {
  const c = document.createElement('canvas')
  c.width = c.height = size * 2
  const g = c.getContext('2d')
  const paint = () => { g.clearRect(0, 0, c.width, c.height); g.drawImage(personCanvas(avatar, 128), 0, 0, c.width, c.height) }
  paint()
  if (photoOf(avatar)) {
    const img = new Image()
    img.onload = () => setTimeout(paint, 0)
    img.src = photoOf(avatar)
  }
  c.style.width = c.style.height = size + 'px'
  return c
}
