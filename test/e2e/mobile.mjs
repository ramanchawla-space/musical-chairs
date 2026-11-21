// Phone player: layout fits a 390px screen, photo upload works, and tapping
// steers you to a chair.

import path from 'path'
import fs from 'fs'
import {
  launch, closeAll, errors, assert, step, hostGame, waitPhase, scrambleForChair, sleep, shot, url, ART,
} from './helpers.mjs'

let failed = false
try {
  const host = await launch('HOST')
  const code = await hostGame(host, 'Desk Host')

  step('phone opens the share link')
  const phone = await launch('PHONE', { width: 390, height: 844 }, { touch: true })
  await phone.goto(url('room=' + code), { waitUntil: 'domcontentloaded' })
  await phone.waitForSelector('#join-btn')
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  assert(overflow <= 0, 'no horizontal scroll on a 390px phone')
  await shot(phone, 'phone-home')

  step('upload a photo as the avatar')
  // Any image will do; make a small one with a canvas in the page.
  const png = await phone.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 300; c.height = 200
    const g = c.getContext('2d')
    const gr = g.createLinearGradient(0, 0, 300, 200)
    gr.addColorStop(0, '#ff3cac'); gr.addColorStop(1, '#00e5ff')
    g.fillStyle = gr; g.fillRect(0, 0, 300, 200)
    g.fillStyle = '#fff'; g.font = 'bold 90px sans-serif'; g.fillText('ME', 70, 130)
    return c.toDataURL('image/png').split(',')[1]
  })
  const file = path.join(ART, 'upload.png')
  fs.writeFileSync(file, Buffer.from(png, 'base64'))
  const input = await phone.$('#photo')
  await input.uploadFile(file)
  await phone.waitForFunction(() => document.querySelector('#avatars button.on')?.title === 'Your photo', { timeout: 5000 })
  assert(true, 'photo avatar selected')
  await phone.type('#nick', 'Phone Pat')
  await phone.tap('#join-btn')
  await phone.waitForFunction(() => window.__mc?.client?.state?.phase === 'lobby')
  await host.waitForFunction(() => [...window.__mc.client.roster.values()].some((p) => p.avatar.startsWith('data:image/jpeg')))
  assert(true, 'host received the photo avatar (downscaled JPEG)')
  const avatarLen = await host.evaluate(() => [...window.__mc.client.roster.values()].find((p) => p.avatar.startsWith('data:')).avatar.length)
  assert(avatarLen < 20000, `photo avatar is small on the wire (${avatarLen} bytes)`)
  await sleep(600)
  await shot(phone, 'phone-lobby')
  const ov2 = await phone.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  assert(ov2 <= 0, 'lobby fits the phone width')

  step('play: phone taps to a chair, host stands still')
  await host.click('#start-btn')
  await waitPhase(phone, 'music', 10000)
  await sleep(1500)
  await shot(phone, 'phone-music')
  await waitPhase(phone, 'scramble', 30000)
  await sleep(200)
  await shot(phone, 'phone-scramble')
  const sat = await scrambleForChair(phone, 'tap')
  assert(sat, 'phone player reached a chair by tapping')
  await waitPhase(phone, 'winner', 20000)
  await sleep(800)
  await shot(phone, 'phone-winner')
  const title = await phone.$eval('#overlay-card h2', (h) => h.textContent)
  assert(/YOU WIN/.test(title), `phone sees "${title}"`)
} catch (e) {
  failed = true
  console.error(e)
}
const real = errors.filter((e) => !/WebRTC|ICE/i.test(e))
if (real.length) { console.error('Browser errors:\n' + real.join('\n')); failed = true }
else console.log('    ✓ no browser errors')
await closeAll()
process.exit(failed ? 1 : 0)
