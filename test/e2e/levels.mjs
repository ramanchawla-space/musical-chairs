// Higher levels (the game climbs to them on its own; the test jumps straight
// there through the host's hub): when the music stops, the obstacles come out (and the
// floor may spin), but the chairs must always stay on screen and clickable.

import {
  launch, closeAll, errors, assert, step, hostGame, joinGame, waitPhase, sleep, shot,
} from './helpers.mjs'

let failed = false
try {
  const host = await launch('HOST')
  const code = await hostGame(host, 'Level Host')
  const p1 = await launch('P1')
  await joinGame(p1, code, 'Level Pat')
  const p2 = await launch('P2')
  await joinGame(p2, code, 'Level Sam')
  await host.waitForFunction(() => window.__mc.client.roster.size === 3)

  // Every free chair: is it on screen, and does a click on it lock on?
  const chairCheck = (page) => page.evaluate(() => {
    const { client, renderer } = window.__mc
    const owners = client.state.owners
    const out = []
    client.chairPoints().forEach((c, i) => {
      if (owners[i]) return
      const s = renderer.toScreen(c.x, c.y, 30)
      const onScreen = s.x > 0 && s.x < innerWidth && s.y > 60 && s.y < innerHeight - 80
      out.push({ i, onScreen, sx: Math.round(s.x), sy: Math.round(s.y), pick: renderer.pickChair(s.x, s.y, client) })
    })
    return { hazards: client.round.hazards, yaw: renderer.yaw, chairs: out, scale: renderer.scale }
  })

  for (const level of [4, 5]) {
    step(`level ${level}`)
    let rounds = 0
    let sawSpin = false
    while (rounds < 6 && !((sawSpin || level < 5) && rounds >= 2)) {
      if (await host.evaluate(() => window.__mc.client.state.phase) !== 'lobby') {
        await host.evaluate(() => window.__mc.client.cmd('lobby'))
        await waitPhase(host, 'lobby')
      }
      await host.click('#start-btn')
      await waitPhase(host, 'intro')
      await host.evaluate((l) => { const h = window.__mc.hub; h.clearTimeout(h.timer); h.startLevel(l) }, level)
      await p1.waitForFunction((l) => window.__mc.client.state.round?.level === l, {}, level)
      await waitPhase(p1, 'scramble', 60000)
      rounds++
      for (const ms of [300, 1500, 3500]) {
        await sleep(ms === 300 ? 300 : ms - (ms === 1500 ? 300 : 1500))
        if (await p1.evaluate(() => window.__mc.client.state.phase) !== 'scramble') break
        const r = await chairCheck(p1)
        if (r.hazards.includes('spin')) sawSpin = true
        await shot(p1, `L${level}-r${rounds}-${ms}ms`)
        const off = r.chairs.filter((c) => !c.onScreen)
        const unpickable = r.chairs.filter((c) => c.onScreen && c.pick < 0)
        if (off.length || unpickable.length) console.log('    ', JSON.stringify({ ms, hazards: r.hazards, yaw: r.yaw.toFixed(2), scale: r.scale.toFixed(3), off, unpickable }))
        assert(off.length === 0, `L${level} round ${rounds} +${ms}ms [${r.hazards.join(',')}]: all ${r.chairs.length} free chairs on screen`)
        assert(unpickable.length === 0, `L${level} round ${rounds} +${ms}ms: every free chair can be clicked`)
      }
      await host.evaluate(() => window.__mc.client.cmd('lobby'))
      await waitPhase(host, 'lobby')
    }
  }
  assert(errors.length === 0, 'no browser errors' + (errors.length ? ': ' + errors.join(' | ') : ''))
} catch (e) {
  failed = true
  console.error(e)
  if (errors.length) console.error(errors.join('\n'))
} finally {
  await closeAll()
  process.exit(failed ? 1 : 0)
}
