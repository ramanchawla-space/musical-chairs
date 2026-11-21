// Full game, five real browsers over real WebRTC:
//   host (also playing) + 4 players. Theme switching, synced music start,
//   identical choreography on every screen, mouse + keyboard steering,
//   chair claims, eliminations agreed by all, and a crowned champion.

import {
  launch, closeAll, errors, assert, step, hostGame, joinGame, waitPhase, phase, scrambleForChair, shot, sleep,
} from './helpers.mjs'

const NAMES = ['Host Hana', 'Disco Dev', 'Beat Bo', 'Funky Fi', 'Groove Gus']
let failed = false

try {
  step('host opens a room')
  const host = await launch('HOST')
  const code = await hostGame(host, NAMES[0])
  assert(/^[A-Z0-9]{5}$/.test(code), `room code ${code}`)
  await shot(host, 'lobby-neon-1')

  step('four players join via the share link')
  const players = []
  for (let i = 1; i < 5; i++) {
    const p = await launch('P' + i)
    await joinGame(p, code, NAMES[i], i * 3)
    players.push(p)
  }
  const all = [host, ...players]
  await host.waitForFunction(() => window.__mc.client.roster.size === 5, { timeout: 15000 })
  for (const p of all) {
    const n = await p.evaluate(() => window.__mc.client.roster.size)
    assert(n === 5, `${p.tag} sees all 5 players in the roster`)
  }
  const guestUi = await players[0].evaluate(() => ({ settings: !document.getElementById('host-settings').hidden, wait: !document.getElementById('guest-wait').hidden }))
  assert(!guestUi.settings && guestUi.wait, 'guests see "waiting for host", not host settings')
  const startEnabled = await host.$eval('#start-btn', (b) => !b.disabled)
  assert(startEnabled, 'host can start with 5 players')
  await shot(host, 'lobby-neon')

  step('host switches theme -> everyone follows')
  for (const theme of ['cosmic', 'sunset', 'neon']) {
    await host.click(`#themes button:nth-child(${['neon', 'cosmic', 'sunset'].indexOf(theme) + 1})`)
    await players[3].waitForFunction((t) => window.__mc.renderer.theme === t, { timeout: 5000 }, theme)
    assert(true, `players switched to ${theme}`)
    await sleep(400)
    await shot(host, `lobby-${theme}`)
  }

  step('clock sync is tight')
  for (const p of players) {
    const off = await p.evaluate(() => window.__mc.client.offset)
    assert(Math.abs(off) < 40, `${p.tag} clock offset ${off.toFixed(1)}ms`)
  }

  step('start the game')
  await host.click('#start-btn')
  for (const p of all) await waitPhase(p, 'intro', 10000)
  assert(true, 'everyone in intro countdown')
  for (const p of all) await waitPhase(p, 'music', 10000)
  const musicOn = await Promise.all(all.map((p) => p.evaluate(() => !!window.__mc.audio.playing)))
  assert(musicOn.every(Boolean), 'music playing on every device')

  // Everyone renders the same dancer at the same spot for the same moment.
  const probe = await Promise.all(all.map((p) => p.evaluate(() => {
    const c = window.__mc.client
    return c.round.order.map((id) => c.dancePoint(id, 2.5)).map((q) => [Math.round(q.x), Math.round(q.y)])
  })))
  assert(probe.every((x) => JSON.stringify(x) === JSON.stringify(probe[0])), 'identical choreography on all 5 screens')

  let round = 0
  let lastTrack = null
  const tracks = new Set()
  while (true) {
    round++
    await waitPhase(host, 'music', 20000)
    const info = await host.evaluate(() => ({ no: window.__mc.client.round.no, m: window.__mc.client.round.m, order: window.__mc.client.round.order, track: window.__mc.audio.trackName() }))
    tracks.add(info.track)
    lastTrack = info.track
    await sleep(1200)
    await shot(host, `r${info.no}-music`)
    step(`round ${info.no}: ${info.order.length} dancers, ${info.m} chairs, track "${info.track}"`)

    // Pick who will stand still and get booted: the last-joined alive player.
    const alive = []
    for (const p of all) {
      const st = await p.evaluate(() => window.__mc.client.status())
      if (st?.alive) alive.push(p)
    }
    const loser = alive[alive.length - 1]
    // The loser goes fully AFK: no steering and no auto-sit even if the dance
    // happens to leave them on top of a chair.
    await loser.evaluate(() => { window.__mc.client.update = () => {} })
    await Promise.all(alive.map((p) => waitPhase(p, 'scramble', 30000)))
    const stopped = await Promise.all(alive.map((p) => p.evaluate(() => !window.__mc.audio.playing)))
    assert(stopped.every(Boolean), 'music cut on every device when it stopped')
    await sleep(300)
    await shot(host, `r${info.no}-scramble`)

    const runners = alive.filter((p) => p !== loser)
    const results = await Promise.all(runners.map((p, i) => scrambleForChair(p, i % 2 ? 'keys' : 'click')))
    assert(results.every(Boolean), `${runners.length} players found a chair (mouse + keyboard)`)

    await waitPhase(host, 'result', 15000)
    await sleep(500)
    await shot(host, `r${info.no}-result`)
    const loserId = await loser.evaluate(() => window.__mc.client.me)
    const bootedViews = await Promise.all(all.map((p) => p.evaluate(() => window.__mc.client.state.booted)))
    assert(bootedViews.every((b) => JSON.stringify(b) === JSON.stringify([loserId])), `everyone agrees ${loser.tag} was booted`)
    const loserBanner = await loser.$eval('#overlay-card h2', (h) => h.textContent)
    assert(/BOOTED/.test(loserBanner), `loser sees "${loserBanner}"`)

    if (alive.length === 2) break
  }

  step('champion is crowned')
  for (const p of all) await waitPhase(p, 'winner', 15000)
  const champs = await Promise.all(all.map((p) => p.evaluate(() => window.__mc.client.state.champion)))
  assert(champs.every((c) => c && c === champs[0]), 'all screens agree on the champion')
  const hostId = await host.evaluate(() => window.__mc.client.me)
  assert(champs[0] === hostId, 'the host (who always sat) is champion')
  await sleep(800)
  await shot(host, 'winner')
  const title = await players[0].$eval('#overlay-card h2', (h) => h.textContent)
  assert(/wins/i.test(title), `players see "${title}"`)
  assert(tracks.size >= 2, `rounds used ${tracks.size} different tracks`)

  step('play again')
  await host.click('#overlay-card .btn.primary')
  for (const p of all) await waitPhase(p, 'intro', 8000)
  const aliveAgain = await host.evaluate(() => Object.values(window.__mc.client.state.status).filter((s) => s.alive).length)
  assert(aliveAgain === 5, 'all 5 back in for game two')
  await host.click('#end-btn')
  for (const p of all) await waitPhase(p, 'lobby', 8000)
  assert(true, 'host can end the game back to the lobby')
} catch (e) {
  failed = true
  console.error(e)
}

const real = errors.filter((e) => !/WebRTC|ICE|peer-unavailable|Could not connect/i.test(e))
if (real.length) { console.error('Browser errors:\n' + real.join('\n')); failed = true }
else console.log('    ✓ no browser errors')
await closeAll()
process.exit(failed ? 1 : 0)
