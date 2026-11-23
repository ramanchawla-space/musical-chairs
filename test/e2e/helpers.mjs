import puppeteer from 'puppeteer'
import fs from 'fs'
import path from 'path'

export const ART = path.resolve('test/artifacts')
fs.mkdirSync(ART, { recursive: true })

const ARGS = ['--no-sandbox', '--disable-features=WebRtcHideLocalIpsWithMdns', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader']

export const BASE = process.env.APP_URL || 'http://localhost:4199/musical-chairs/'
export const PEER_QS = process.env.CLOUD ? '' : `peerhost=localhost&peerport=${process.env.PEER_PORT || 9123}`

export function url(qs = '') {
  const parts = [PEER_QS, qs].filter(Boolean).join('&')
  return BASE + (parts ? '?' + parts : '')
}

export const errors = []
const browsers = []
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const step = (m) => console.log('  → ' + m)

export async function launch(tag, viewport = { width: 1280, height: 800 }, opts = {}) {
  const b = await puppeteer.launch({ headless: true, args: ARGS })
  browsers.push(b)
  const page = await b.newPage()
  await page.setViewport(viewport)
  if (opts.touch) await page.emulate({ viewport: { ...viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' })
  page.on('pageerror', (e) => errors.push(`[${tag}] PAGEERROR: ${e.message}`))
  page.on('console', (m) => {
    const t = m.text()
    // Font CDN may be unreachable in CI; that isn't an app error.
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|favicon/.test(t)) errors.push(`[${tag}] ${t}`)
  })
  page.tag = tag
  page.browser_ = b
  return page
}

export async function closeAll() {
  for (const b of browsers) await b.close().catch(() => {})
}

export function assert(cond, msg) {
  if (!cond) throw new Error('ASSERTION FAILED: ' + msg)
  console.log('    ✓ ' + msg)
}

export async function hostGame(page, name, { plays = true, avatar = 3, qs = 'fast=1' } = {}) {
  await page.goto(url(qs), { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#nick')
  await page.type('#nick', name)
  await page.click(`#avatars button:nth-child(${avatar + 1})`)
  if (!plays) await page.click('#host-plays')
  await page.click('#host-btn')
  await page.waitForFunction(() => !document.getElementById('lobby').hidden && /^[A-Z0-9]{5}$/.test(document.getElementById('room-code').textContent), { timeout: 30000 })
  return page.$eval('#room-code', (e) => e.textContent)
}

export async function joinGame(page, code, name, avatar = 5) {
  await page.goto(url('room=' + code), { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#join-btn')
  await page.type('#nick', name)
  await page.click(`#avatars button:nth-child(${avatar + 1})`)
  await page.click('#join-btn')
  await page.waitForFunction(() => window.__mc?.client?.me && window.__mc.client.state, { timeout: 30000 })
}

export async function phase(page) {
  return page.evaluate(() => window.__mc?.client?.state?.phase)
}

export async function waitPhase(page, ph, timeout = 40000) {
  await page.waitForFunction((p) => window.__mc?.client?.state?.phase === p, { timeout, polling: 50 }, ph)
}

export async function myStatus(page) {
  return page.evaluate(() => {
    const c = window.__mc.client
    return { id: c.me, ...(c.status() || {}) }
  })
}

// Screen coordinates of the best free chair to go for (or null). Chairs can
// outrun players, so like a good human we aim for the earliest intercept:
// the spot where a chair will be when we can get there.
async function nearestChairScreen(page) {
  return page.evaluate(() => {
    const { client, renderer } = window.__mc
    const me = client.self
    if (!me) return null
    const now = client.hostNow()
    const owners = client.state.owners
    const speed = 300
    let best = null
    let bi = -1
    for (let ms = 0; ms <= 4000 && !best; ms += 50) {
      const pts = client.chairPoints(now + ms)
      for (let i = 0; i < pts.length; i++) {
        if (owners[i]) continue
        const d = Math.hypot(pts[i].x - me.x, pts[i].y - me.y)
        if (d <= (speed * ms) / 1000 * 0.85 + 20) { best = pts[i]; bi = i; break }
      }
    }
    if (!best) {
      const pts = client.chairPoints(now)
      let bd = Infinity
      pts.forEach((c, i) => {
        if (owners[i]) return
        const d = Math.hypot(c.x - me.x, c.y - me.y)
        if (d < bd) { bd = d; best = c; bi = i }
      })
    }
    if (!best) return null
    // A person clicks the chair itself (its seat, where they see it now),
    // which grabs it on the spot.
    const cur = client.chairPoints(now)[bi]
    const s = renderer.toScreen(cur.x, cur.y, 30)
    // keys steer relative to the (possibly spinning) camera
    const wx = best.x - me.x
    const wy = best.y - me.y
    const c = Math.cos(renderer.yaw)
    const sn = Math.sin(renderer.yaw)
    return { sx: s.x, sy: s.y, dx: wx * c - wy * sn, dy: wx * sn + wy * c }
  })
}

// Play the scramble like a human: click / tap / steer with keys towards the
// nearest free chair until seated or the round ends.
export async function scrambleForChair(page, how = 'click') {
  const t0 = Date.now()
  const held = new Set()
  try {
    while (Date.now() - t0 < 9000) {
      const st = await page.evaluate(() => ({ phase: window.__mc.client.state.phase, seat: window.__mc.client.status()?.seat, alive: window.__mc.client.status()?.alive }))
      if (st.phase !== 'scramble' || st.seat >= 0 || !st.alive) {
        if (st.seat < 0) console.log(`    ! ${page.tag} round moved on without a seat: ${JSON.stringify(st)} ${await page.evaluate(() => JSON.stringify({ owners: window.__mc.client.state.owners, booted: window.__mc.client.state.booted, me: window.__mc.client.me }))}`)
        return st.seat >= 0
      }
      const c = await nearestChairScreen(page)
      // the state may have landed between the two reads: did I just sit?
      if (!c && await page.evaluate(() => window.__mc.client.state.owners.includes(window.__mc.client.me))) return true
      if (!c) { console.log(`    ! ${page.tag} sees no free chair: ${await page.evaluate(() => JSON.stringify({ owners: window.__mc.client.state.owners, me: window.__mc.client.me, self: window.__mc.client.self }))}`); return false }
      if (how === 'click') {
        await page.mouse.click(c.sx, c.sy)
        if (await page.evaluate(() => window.__mc.client.pendingSit >= 0 || window.__mc.client.status()?.seat >= 0)) page.lockSeen = true
      }
      else if (how === 'tap') await page.touchscreen.tap(c.sx, c.sy)
      else {
        const want = new Set()
        if (c.dx < -6) want.add('ArrowLeft')
        if (c.dx > 6) want.add('ArrowRight')
        if (c.dy < -6) want.add('ArrowUp')
        if (c.dy > 6) want.add('ArrowDown')
        for (const k of held) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k) }
        for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k) }
      }
      await sleep(how === 'keys' ? 40 : 120)
    }
  } finally {
    for (const k of held) await page.keyboard.up(k)
  }
  const diag = await page.evaluate(() => {
    const c = window.__mc.client
    const chairs = c.chairPoints()
    return JSON.stringify({ phase: c.state.phase, self: c.self && { x: Math.round(c.self.x), y: Math.round(c.self.y) }, st: c.status(), owners: c.state.owners, pending: c.pendingSit,
      chairs: chairs.map((p) => [Math.round(p.x), Math.round(p.y)]), target: c.input.target, keys: [...c.input.keys], arena: c.round.arena })
  })
  console.log(`    ! ${page.tag} (${how}) did not sit: ${diag}`)
  return false
}

export async function shot(page, name) {
  const file = path.join(ART, name + '.png')
  await page.screenshot({ path: file })
  return file
}
