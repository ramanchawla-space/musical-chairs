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

  step('lobby music preview')
  await players[0].click('#preview-btn')
  await players[0].waitForFunction(() => !!window.__mc.audio.playing)
  const pv = await players[0].$eval('#preview-name', (e) => e.textContent)
  assert(/♪/.test(pv), `preview plays "${pv}"`)
  await players[0].click('#next-track')
  const pv2 = await players[0].$eval('#preview-name', (e) => e.textContent)
  assert(pv2 !== pv, `next track: "${pv2}"`)
  await players[0].click('#preview-btn')
  assert(!(await players[0].evaluate(() => !!window.__mc.audio.playing)), 'preview stops')

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
  let firstOut = null
  const tracks = new Set()
  while (true) {
    round++
    await waitPhase(host, 'music', 20000)
    const info = await host.evaluate(() => ({ no: window.__mc.client.round.no, m: window.__mc.client.round.m, order: window.__mc.client.round.order, track: window.__mc.audio.trackName() }))
    tracks.add(info.track)
    lastTrack = info.track
    if (firstOut) {
      await firstOut.waitForSelector('#predict:not([hidden]) .pr-row button', { timeout: 5000 })
      if (info.no === 2) {
        await firstOut.click('#predict .pr-row button')
        await firstOut.waitForFunction(() => !!window.__mc.client.state.status[window.__mc.client.me].pick, { timeout: 5000 })
        await shot(firstOut, 'predict')
      }
    }
    await sleep(1200)
    await shot(host, `r${info.no}-music`)
    if (info.no === 1) {
      // Clicking a chair while the music plays does nothing.
      const pt = await players[0].evaluate(() => {
        const { client, renderer } = window.__mc
        const c = client.chairPoints()[0]
        return renderer.toScreen(c.x, c.y, 30)
      })
      const before = await players[0].evaluate(() => window.__mc.client.state.phase)
      await players[0].mouse.click(pt.x, pt.y)
      const t = await players[0].evaluate(() => ({ target: window.__mc.client.input.target, phase: window.__mc.client.state.phase }))
      if (before === 'music' && t.phase === 'music') assert(t.target === null, 'clicks during the music are ignored')
      else console.log(`    (music ended before the click check: ${before} -> ${t.phase}, target ${JSON.stringify(t.target)})`)
    }
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
    if (info.no === 1) {
      // Wild chairs keep moving after the music stops, identically everywhere.
      const probeT = await host.evaluate(() => window.__mc.client.round.stopAt + 1500)
      const views = await Promise.all(alive.map((p) => p.evaluate((t) => JSON.stringify(window.__mc.client.chairPoints(t).map((c) => [Math.round(c.x), Math.round(c.y)])), probeT)))
      assert(views.every((v) => v === views[0]), 'every screen agrees where the moving chairs are')
      const moved = await host.evaluate(() => {
        const c = window.__mc.client
        const a = c.chairPoints(c.round.stopAt)
        const b = c.chairPoints(c.round.stopAt + 2000)
        return Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)))
      })
      assert(moved > 40, `chairs move after the music stops (up to ${moved.toFixed(0)} units in 2s)`)
      const duringMusic = await host.evaluate(() => {
        const c = window.__mc.client
        // distance travelled along the path (a fast chair can dart out and back)
        const travelled = c.round.chairs.map(() => 0)
        let prev = c.chairPoints(c.round.musicAt)
        for (let ms = 50; ms <= 2000; ms += 50) {
          const cur = c.chairPoints(c.round.musicAt + ms)
          cur.forEach((p, i) => { travelled[i] += Math.hypot(p.x - prev[i].x, p.y - prev[i].y) })
          prev = cur
        }
        return Math.min(...travelled)
      })
      assert(duringMusic > 60, `every chair is already roaming while the music plays (each moved ≥ ${duringMusic.toFixed(0)} units in 2s) — no pre-aiming`)
    }
    await sleep(300)
    await shot(host, `r${info.no}-scramble`)
    if (info.no === 1) {
      const tm = await host.evaluate(() => ({ shown: !document.getElementById('timer').hidden, n: +document.getElementById('timer-n').textContent }))
      assert(tm.shown && tm.n > 0, `a hurry-up timer counts down once the music stops (${tm.n}s left)`)
    }

    const runners = alive.filter((p) => p !== loser)
    const results = await Promise.all(runners.map((p, i) => scrambleForChair(p, i % 2 ? 'keys' : 'click')))
    if (runners.some((p, i) => i % 2 === 0 && p.lockSeen)) assert(true, 'clicking a chair grabs it on the spot')
    else if (info.no === 1) assert(false, 'clicking a chair grabs it on the spot')
    assert(results.every(Boolean), `${runners.length} players found a chair (mouse + keyboard)`)

    await waitPhase(host, 'result', 15000)
    await sleep(500)
    await shot(host, `r${info.no}-result`)
    const loserId = await loser.evaluate(() => window.__mc.client.me)
    const bootedViews = await Promise.all(all.map((p) => p.evaluate(() => window.__mc.client.state.booted)))
    assert(bootedViews.every((b) => JSON.stringify(b) === JSON.stringify([loserId])), `everyone agrees ${loser.tag} was booted`)
    const loserBanner = await loser.$eval('#overlay-card h2', (h) => h.textContent)
    assert(/BOOTED/.test(loserBanner), `loser sees "${loserBanner}"`)

    if (round === 1) {
      firstOut = loser
      const pts = await host.evaluate(() => Object.values(window.__mc.client.state.status).map((x) => x.pts))
      assert(pts.filter((x) => x > 0).length === 4, `the 4 who sat scored points (${pts.join(', ')})`)
      const jt = await host.$$eval('#side-roster .jt-pts', (els) => els.map((e) => +e.textContent))
      assert(jt.some((x) => x > 0), `the jumbotron shows the scores (${jt.join(', ')})`)
      const facts = await host.$eval('#overlay-card', (c) => c.textContent)
      assert(/Fastest/.test(facts), 'the result card names the fastest sitter')
    } else if (round === 2) {
      const pick = await firstOut.evaluate(() => window.__mc.client.state.status[window.__mc.client.me].pick)
      assert(!!pick, 'the first player out made a "who\'s out next?" call in round 2')
    }
    if (alive.length === 2) break
  }

  step('level 1 complete: everyone comes back for level 2')
  for (const p of all) await waitPhase(p, 'levelup', 15000)
  const hostId = await host.evaluate(() => window.__mc.client.me)
  const lc = await Promise.all(all.map((p) => p.evaluate(() => window.__mc.client.state.levelChamp)))
  assert(lc.every((c) => c === hostId), 'the host (who always sat) won level 1, and everyone agrees')
  await sleep(600)
  await shot(host, 'levelup')
  const lvCard = await players[0].$eval('#overlay-card', (c) => c.textContent)
  assert(/Level 1 complete/.test(lvCard) && /Level 2/.test(lvCard), 'the level card names the next level')
  for (const p of all) await waitPhase(p, 'intro', 15000)
  const back = await host.evaluate(() => ({ level: window.__mc.client.state.round.level, alive: Object.values(window.__mc.client.state.status).filter((s) => s.alive).length }))
  assert(back.level === 2 && back.alive === 5, `level 2 starts on its own with all 5 back in (${JSON.stringify(back)})`)

  step('host ends the game: the most points wins')
  host.once('dialog', (d) => d.accept())
  await host.click('#end-btn')
  for (const p of all) await waitPhase(p, 'winner', 15000)
  const champs = await Promise.all(all.map((p) => p.evaluate(() => window.__mc.client.state.champion)))
  assert(champs.every((c) => c && c === champs[0]), 'all screens agree on the champion')
  const pts = await host.evaluate(() => window.__mc.client.state.status)
  assert(pts[champs[0]].pts === Math.max(...Object.values(pts).map((x) => x.pts)), 'the champion has the most points')
  await sleep(800)
  await shot(host, 'winner')
  const steps = await host.$$eval('#overlay-card .podium .step', (els) => els.length)
  assert(steps === 3, 'the winner screen shows a top-3 podium')
  const title = await players[0].$eval('#overlay-card h2', (h) => h.textContent)
  assert(/wins/i.test(title), `players see "${title}"`)
  assert(tracks.size >= 2, `rounds used ${tracks.size} different tracks`)

  step('play again')
  await host.click('#overlay-card .btn.primary')
  for (const p of all) await waitPhase(p, 'intro', 8000)
  const aliveAgain = await host.evaluate(() => Object.values(window.__mc.client.state.status).filter((s) => s.alive).length)
  assert(aliveAgain === 5, 'all 5 back in for game two')
  host.once('dialog', (d) => d.accept())
  await host.click('#end-btn')
  for (const p of all) await waitPhase(p, 'winner', 8000)
  await host.click('#overlay-card .btn:not(.primary)')
  for (const p of all) await waitPhase(p, 'lobby', 8000)
  assert(true, 'host can end the game and go back to the lobby')
} catch (e) {
  failed = true
  console.error(e)
}

const real = errors.filter((e) => !/WebRTC|ICE|peer-unavailable|Could not connect/i.test(e))
if (real.length) { console.error('Browser errors:\n' + real.join('\n')); failed = true }
else console.log('    ✓ no browser errors')
await closeAll()
process.exit(failed ? 1 : 0)
