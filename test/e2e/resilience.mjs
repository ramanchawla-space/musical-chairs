// The things that go wrong on a real Friday:
//   - host runs the game on a big screen without playing
//   - someone refreshes in the lobby (must not duplicate them)
//   - someone's laptop dies mid-round (must not hang the game)
//   - someone joins late (waits, then plays the next game)
//   - host-DJ mode: music only stops when the host hits Space

import {
  launch, closeAll, errors, assert, step, hostGame, joinGame, waitPhase, scrambleForChair, sleep, shot, url,
} from './helpers.mjs'

let failed = false
try {
  step('host opens a big-screen room (not playing)')
  const host = await launch('HOST')
  const code = await hostGame(host, 'Big Screen', { plays: false })
  const players = []
  for (let i = 1; i <= 3; i++) {
    const p = await launch('P' + i)
    await joinGame(p, code, 'Player ' + i, i)
    players.push(p)
  }
  const [p1, p2, p3] = players
  await host.waitForFunction(() => window.__mc.client.roster.size === 4)
  const note = await host.$eval('#lobby-note', (e) => e.textContent)
  assert(/3 players · 2 chairs/.test(note), `host lobby: "${note}"`)

  step('P2 refreshes the page in the lobby')
  const p2id = await p2.evaluate(() => window.__mc.client.me)
  await p2.reload({ waitUntil: 'domcontentloaded' })
  await p2.waitForSelector('#join-btn')
  const prefilled = await p2.$eval('#nick', (e) => e.value)
  assert(prefilled === 'Player 2', 'nickname remembered after refresh')
  await p2.click('#join-btn')
  await p2.waitForFunction(() => window.__mc?.client?.me)
  const p2idAfter = await p2.evaluate(() => window.__mc.client.me)
  assert(p2idAfter === p2id, 'same player identity after refresh')
  await sleep(500)
  const size = await host.evaluate(() => window.__mc.client.roster.size)
  assert(size === 4, 'no duplicate player after refresh')

  step('start; P3\'s laptop dies mid-music')
  await host.click('#start-btn')
  await waitPhase(host, 'music', 10000)
  const order = await host.evaluate(() => window.__mc.client.round.order)
  assert(order.length === 3 && !order.includes(await host.evaluate(() => window.__mc.client.me)), 'host is not in the dance')
  const p3id = await p3.evaluate(() => window.__mc.client.me)
  await p3.browser_.close()
  await waitPhase(host, 'scramble', 30000)
  await Promise.all([scrambleForChair(p1, 'click'), scrambleForChair(p2, 'keys')])
  await waitPhase(host, 'result', 12000)
  const booted = await host.evaluate(() => window.__mc.client.state.booted)
  assert(booted.length === 1 && booted[0] === p3id, 'the vanished player was booted and the round finished')

  step('a latecomer joins mid-game')
  const late = await launch('LATE')
  await joinGame(late, code, 'Latecomer', 9)
  const lateSt = await late.evaluate(() => window.__mc.client.status())
  assert(lateSt.waiting && !lateSt.alive, 'latecomer waits for the next game')
  await waitPhase(late, 'music', 15000)
  const hint = await late.$eval('#hint', (e) => !e.hidden && e.textContent)
  assert(/next one/.test(hint), `latecomer sees: "${hint}"`)
  await shot(host, 'bigscreen-music')

  step('final round: P1 sits, P2 stands still')
  await waitPhase(p1, 'scramble', 30000)
  await scrambleForChair(p1, 'click')
  await waitPhase(host, 'winner', 20000)
  const champ = await host.evaluate(() => window.__mc.client.state.champion)
  assert(champ === (await p1.evaluate(() => window.__mc.client.me)), 'P1 is champion')

  step('host DJ mode: music runs until the host hits Space')
  await host.click('#overlay-card .btn:not(.primary)') // back to lobby
  await waitPhase(host, 'lobby')
  await host.click('#dj-seg button[data-v="manual"]')
  await host.waitForFunction(() => window.__mc.client.state.settings.dj === 'manual')
  await host.click('#start-btn')
  await waitPhase(host, 'music', 10000)
  const alive = await host.evaluate(() => Object.values(window.__mc.client.state.status).filter((s) => s.alive).length)
  assert(alive === 3, 'game two: P1, P2 and the latecomer are all in')
  await sleep(9000) // longer than any fast-mode auto stop
  assert((await host.evaluate(() => window.__mc.client.state.phase)) === 'music', 'music still going after 9s')
  const stopVisible = await host.$eval('#stop-btn', (b) => !b.hidden)
  assert(stopVisible, 'host sees the STOP button')
  await host.keyboard.press('Space')
  await waitPhase(p1, 'scramble', 5000)
  assert(true, 'Space stopped the music for everyone')
} catch (e) {
  failed = true
  console.error(e)
}
const real = errors.filter((e) => !/WebRTC|ICE|peer-unavailable|Could not connect|Lost connection|ERR_CONNECTION|net::/i.test(e))
if (real.length) { console.error('Browser errors:\n' + real.join('\n')); failed = true }
else console.log('    ✓ no browser errors')
await closeAll()
process.exit(failed ? 1 : 0)
