// Same flow as production: the public PeerJS cloud broker (0.peerjs.com) for
// signalling — no local broker. Host + 2 players play a full game.

import {
  launch, closeAll, errors, assert, step, hostGame, joinGame, waitPhase, scrambleForChair,
} from './helpers.mjs'

let failed = false
try {
  step('host opens a room on the PeerJS cloud')
  const host = await launch('HOST')
  const code = await hostGame(host, 'Cloud Host')
  assert(true, `room ${code} registered with the public broker`)
  const p1 = await launch('P1')
  const p2 = await launch('P2')
  await joinGame(p1, code, 'Cloud One', 2)
  await joinGame(p2, code, 'Cloud Two', 4)
  await host.waitForFunction(() => window.__mc.client.roster.size === 3, { timeout: 20000 })
  assert(true, 'both players connected through the cloud broker')

  await host.click('#start-btn')
  // Round 1: host + p1 sit, p2 doesn't. Round 2: host sits.
  await waitPhase(host, 'scramble', 40000)
  await Promise.all([scrambleForChair(host, 'click'), scrambleForChair(p1, 'keys')])
  await waitPhase(p2, 'result', 15000)
  const b1 = await p2.evaluate(() => window.__mc.client.state.booted)
  assert(b1[0] === (await p2.evaluate(() => window.__mc.client.me)), 'round 1: P2 booted')
  await waitPhase(host, 'scramble', 40000)
  await scrambleForChair(host, 'click')
  await waitPhase(p1, 'winner', 20000)
  const champ = await p1.evaluate(() => window.__mc.client.state.champion)
  assert(champ === (await host.evaluate(() => window.__mc.client.me)), 'host wins; everyone agrees over the cloud')
} catch (e) {
  failed = true
  console.error(e)
}
const real = errors.filter((e) => !/WebRTC|ICE/i.test(e))
if (real.length) { console.error('Browser errors:\n' + real.join('\n')); failed = true }
else console.log('    ✓ no browser errors')
await closeAll()
process.exit(failed ? 1 : 0)
