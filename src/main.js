import './styles.css'
import qrcode from 'qrcode-generator'
import { Hub } from './hub.js'
import { GameClient } from './client.js'
import { hostRoom, joinRoom, localLink } from './net.js'
import { Renderer, THEME_INFO } from './render.js'
import { SoundEngine, TRACKS, roundTrack } from './audio.js'
import { PRESETS, presetKey, avatarEl, photoToAvatar } from './avatars.js'
import { CHAIR_RADIUS, LAYOUT_NAMES, PATTERN_NAMES, segmentAt, chairCount } from './core.js'
import { workerTimers } from './timers.js'

const $ = (id) => document.getElementById(id)
const params = new URLSearchParams(location.search)
const FAST = params.has('fast') // test hook: shorter rounds

const renderer = new Renderer($('stage'))
const audio = new SoundEngine()
let client = null
let hub = null
let hostHandle = null
let phaseStart = performance.now()
let countdownTimers = []

// --- Persistent profile -------------------------------------------------------------
// Per-tab id (sessionStorage) so a refresh rejoins as the same player, while two
// tabs on one machine are still two different players.

const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d } catch { return d } },
  set(k, v) { try { localStorage.setItem(k, v) } catch {} },
}
function tabId() {
  try {
    let id = sessionStorage.getItem('mc_cid')
    if (!id) { id = 'c' + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('mc_cid', id) }
    return id
  } catch { return 'c' + Math.random().toString(36).slice(2, 10) }
}

let avatar = store.get('mc_avatar', presetKey(Math.floor(Math.random() * PRESETS.length)))
$('nick').value = store.get('mc_name', '')

// --- Home screen ---------------------------------------------------------------------

function renderAvatarGrid() {
  const grid = $('avatars')
  grid.innerHTML = ''
  const opts = PRESETS.map((_, i) => presetKey(i))
  if (avatar.startsWith('data:')) opts.unshift(avatar)
  for (const key of opts) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = key === avatar ? 'on' : ''
    b.title = key.startsWith('data:') ? 'Your photo' : PRESETS[+key.slice(1)][0]
    b.appendChild(avatarEl(key, 96))
    b.onclick = () => { avatar = key; store.set('mc_avatar', key); renderAvatarGrid() }
    grid.appendChild(b)
  }
}
renderAvatarGrid()

$('photo').onchange = async (e) => {
  const f = e.target.files[0]
  if (!f) return
  try {
    avatar = await photoToAvatar(f)
    store.set('mc_avatar', avatar)
    // Photo avatars load asynchronously; redraw once decoded.
    renderAvatarGrid()
  } catch (err) { showErr(err.message) }
}

const roomParam = (params.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
function showJoinMode(on) {
  $('join-box').hidden = !on
  $('host-box').hidden = on
  if (on) $('join-code').textContent = roomParam
}
showJoinMode(!!roomParam)
$('switch-host').onclick = () => showJoinMode(false)

function showErr(msg) {
  $('home-err').textContent = msg
  $('home-err').hidden = !msg
}

function profile(spectator = false) {
  const name = $('nick').value.trim()
  return { cid: tabId(), name, avatar, spectator }
}

function validName() {
  const name = $('nick').value.trim()
  if (!name) { showErr('Pick a nickname first 🙂'); $('nick').focus(); return false }
  store.set('mc_name', name)
  showErr('')
  return true
}

function busy(btn, on, label) {
  btn.disabled = on
  if (label) btn.dataset.label ??= btn.innerHTML
  btn.innerHTML = on ? label : btn.dataset.label || btn.innerHTML
}

$('host-btn').onclick = async () => {
  const plays = $('host-plays').checked
  if (plays && !validName()) return
  if (!plays && !$('nick').value.trim()) $('nick').value = 'Host'
  audio.ensure()
  busy($('host-btn'), true, 'Opening the dance floor…')
  try {
    const timers = workerTimers()
    hub = new Hub({
      ...timers,
      ...(FAST ? { timing: { intro: 1800, result: 2000, scrambleMax: 7000, settle: 500 }, musicScale: 0.3 } : {}),
    })
    hostHandle = await hostRoom(hub, params.get('code') || undefined)
    const link = localLink(hub)
    startClient(link, profile(!plays), hostHandle.room)
    history.replaceState(null, '', location.pathname + '?room=' + hostHandle.room)
    window.addEventListener('beforeunload', (e) => {
      if (hub && hub.phase !== 'lobby') { e.preventDefault(); e.returnValue = '' }
    })
  } catch (err) {
    console.error(err)
    showErr('Could not open a room: ' + (err.type || err.message) + '. Check your connection and try again.')
    busy($('host-btn'), false)
  }
}

async function join(code) {
  if (!validName()) return
  code = code.toUpperCase().trim()
  if (code.length < 4) return showErr('Enter the room code from your host')
  audio.ensure()
  const btn = roomParam ? $('join-btn') : $('code-btn')
  busy(btn, true, 'Joining…')
  try {
    const link = await joinRoom(code)
    startClient(link, profile(false), code)
  } catch (err) {
    console.error(err)
    showErr(err.message || 'Could not join')
    busy(btn, false)
  }
}
$('join-btn').onclick = () => join(roomParam)
$('code-btn').onclick = () => join($('code').value)
$('code').onkeydown = (e) => { if (e.key === 'Enter') join($('code').value) }
$('nick').onkeydown = (e) => { if (e.key === 'Enter') (roomParam ? $('join-btn') : $('host-btn')).click() }

// --- Wiring a client -----------------------------------------------------------------------

function startClient(link, prof, room) {
  client = new GameClient(link, prof)
  window.__mc = { client, hub, renderer, audio }
  $('home').hidden = true
  const url = location.origin + location.pathname + '?room=' + room
  $('room-code').textContent = room
  $('share-url').value = url
  const qr = qrcode(0, 'M')
  qr.addData(url)
  qr.make()
  $('qr').innerHTML = qr.createSvgTag({ cellSize: 3, margin: 0, scalable: true })
  client.on('welcome', () => { $('host-settings').hidden = !client.isHost; $('guest-wait').hidden = client.isHost; $('host-ctl').hidden = !client.isHost })
  client.on('roster', () => { renderRoster(); renderSideRoster() })
  client.on('state', onState)
  client.on('react', (id, e) => renderer.react(id, e))
  client.on('denied', () => audio.sfx('denied'))
  client.on('lost', () => {
    if (client.isHost) return
    toast('Lost connection to the host. Rejoining…')
    reconnect(room, prof)
  })
  client.on('kicked', () => { alert2('The host removed you from the room.'); location.href = location.pathname })
}

let reconnecting = false
async function reconnect(room, prof) {
  if (reconnecting) return
  reconnecting = true
  client.destroy()
  for (let i = 0; i < 20; i++) {
    try {
      const link = await joinRoom(room)
      const old = client
      client = new GameClient(link, prof)
      client.listeners = old.listeners
      window.__mc.client = client
      toast('Back on the floor ✔')
      reconnecting = false
      return
    } catch { await new Promise((r) => setTimeout(r, 2500)) }
  }
  reconnecting = false
  toast('Could not reach the host — is their tab still open?')
}

function alert2(msg) { toast(msg) }

let toastTimer = 0
function toast(msg, ms = 2600) {
  const t = $('toast')
  t.textContent = msg
  t.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (t.hidden = true), ms)
}

$('copy-btn').onclick = async () => {
  try { await navigator.clipboard.writeText($('share-url').value); toast('Link copied — send it to the team!') } catch { $('share-url').select() }
}

// --- Lobby -----------------------------------------------------------------------------

function renderRoster() {
  const ul = $('roster')
  ul.innerHTML = ''
  const list = [...client.roster.values()]
  const playing = list.filter((p) => !p.spectator)
  $('count').textContent = playing.length
  for (const p of list) {
    const li = document.createElement('li')
    if (p.spectator) li.className = 'spec'
    li.appendChild(avatarEl(p.avatar, 52))
    li.append(p.name + (p.id === client.me ? ' (you)' : '') + (p.spectator ? ' · host screen' : ''))
    if (client.isHost && p.id !== client.me) {
      const x = document.createElement('button')
      x.className = 'x'
      x.textContent = '✕'
      x.title = 'Remove'
      x.onclick = () => client.cmd('kick', { id: p.id })
      li.appendChild(x)
    }
    ul.appendChild(li)
  }
  $('start-btn').disabled = playing.length < 2
  $('lobby-note').textContent = playing.length < 2 ? 'Waiting for at least 2 players…' : `${playing.length} players · ${chairCount(playing.length, client.state?.settings?.mode)} chairs in round 1`
}

function renderThemes() {
  const box = $('themes')
  box.innerHTML = ''
  for (const [key, t] of Object.entries(THEME_INFO)) {
    const b = document.createElement('button')
    b.className = 'theme' + (renderer.theme === key ? ' on' : '')
    b.innerHTML = `<span class="sw ${key}"></span><b>${t.label}</b>`
    b.title = t.blurb
    b.onclick = () => client.cmd('settings', { settings: { theme: key } })
    box.appendChild(b)
  }
}
renderThemes()

const SEGS = { 'mode-seg': 'mode', 'dj-seg': 'dj', 'layout-seg': 'layout', 'motion-seg': 'motion' }
for (const segId of Object.keys(SEGS)) {
  $(segId).onclick = (e) => {
    const b = e.target.closest('button')
    if (!b) return
    const key = SEGS[segId]
    client.cmd('settings', { settings: { [key]: b.dataset.v } })
  }
}
$('start-btn').onclick = () => { audio.ensure(); client.cmd('start') }
$('stop-btn').onclick = () => client.cmd('stop')
$('end-btn').onclick = () => client.cmd('lobby')
$('mute-btn').onclick = () => toggleMute()
function toggleMute() {
  audio.setMuted(!audio.muted)
  $('mute-btn').textContent = audio.muted ? '🔇' : '🔊'
}

// --- Music preview (lobby) ---------------------------------------------------------
// Lets anyone listen to the soundtrack while waiting. Local to this device.

let previewing = false
let previewIdx = TRACKS.findIndex((t) => t.melody)
function renderPreview() {
  $('preview-btn').textContent = previewing ? '⏹ Stop the music' : '🎧 Play the music'
  $('next-track').hidden = !previewing
  $('preview-name').textContent = previewing ? `♪ ${TRACKS[previewIdx].name}` : `${TRACKS.length} tracks in the mix`
}
function playPreview() {
  audio.play(previewIdx, Date.now() + 80)
  previewing = true
  renderPreview()
}
$('preview-btn').onclick = () => {
  if (previewing) { audio.stop(false); previewing = false; renderPreview() } else playPreview()
}
$('next-track').onclick = () => { previewIdx = (previewIdx + 1) % TRACKS.length; playPreview() }
renderPreview()

// --- Reactions ---------------------------------------------------------------------------

const EMOJIS = ['🔥', '😂', '💃', '🎉', '😱', '👏']
EMOJIS.forEach((e, i) => {
  const b = document.createElement('button')
  b.textContent = e
  b.title = `${e} (${i + 1})`
  b.onclick = () => client && client.react(e)
  $('reactions').appendChild(b)
})

// --- State changes ------------------------------------------------------------------------

function onState(s, prev) {
  const phase = s.phase
  const prevPhase = prev?.phase
  if (s.settings.theme !== renderer.theme) { renderer.setTheme(s.settings.theme); renderThemes() }
  for (const [segId, key] of Object.entries(SEGS)) {
    $(segId).querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === s.settings[key]))
  }
  if (s.notice && client.isHost) toast(s.notice)

  $('lobby').hidden = phase !== 'lobby'
  $('hud').hidden = phase === 'lobby'
  if (phase === 'lobby') renderRoster()

  if (phase !== prevPhase) {
    phaseStart = performance.now()
    onPhase(phase, prevPhase, s)
  }
  // Someone just sat down?
  if (prev && phase === 'scramble' && prev.owners) {
    s.owners.forEach((o, i) => {
      if (o && !prev.owners[i]) {
        const c = client.chairPoints()[i]
        const info = client.roster.get(o)
        if (c) renderer.burst(c.x, c.y, info?.color || '#fff')
        audio.sfx(o === client.me ? 'sit' : 'other-sit')
        if (o === client.me) { banner('SAFE! 🪑'); client.input.target = null }
      }
    })
  }
  updateHud()
  renderSideRoster()
}

function onPhase(phase, prevPhase, s) {
  countdownTimers.forEach(clearTimeout)
  countdownTimers = []
  $('overlay').hidden = true
  const r = s.round
  if (phase === 'intro') {
    // Line the countdown up with the host's music-start moment.
    const localMusic = r.musicAt - client.offset
    audio.play(roundTrack(r.track), localMusic)
    previewing = false
    for (const n of [3, 2, 1]) {
      const at = localMusic - n * 1000 - Date.now()
      if (at > -200) countdownTimers.push(setTimeout(() => { banner(String(n)); audio.sfx('tick') }, Math.max(0, at)))
    }
    countdownTimers.push(setTimeout(() => banner('DANCE!'), Math.max(0, localMusic - Date.now())))
    if (r.no === 1) toast(`${r.m} chairs · ${Object.values(s.status).filter((x) => x.alive).length} dancers`)
  } else if (phase === 'music') {
    if (!audio.playing) audio.play(roundTrack(r.track), r.musicAt - client.offset)
  } else if (phase === 'scramble') {
    audio.stop(true)
    renderer.flash('#ff2f4f', 0.55)
    renderer.bump(18)
    banner('SIT!!!', true)
  } else if (phase === 'result') {
    audio.stop(false)
    showResult(s)
  } else if (phase === 'winner') {
    audio.stop(false)
    renderer.confetti()
    audio.sfx('win')
    showWinner(s)
  } else if (phase === 'lobby') {
    audio.stop(false)
    previewing = false
    renderPreview()
  }
}

function banner(text, stop = false) {
  const b = $('banner')
  b.textContent = text
  b.className = 'banner'
  void b.offsetWidth
  b.className = 'banner show' + (stop ? ' stop' : '')
}

function nameOf(id) { return client.roster.get(id)?.name || '???' }

function chip(id) {
  const span = document.createElement('span')
  span.append(avatarEl(client.roster.get(id)?.avatar || 'p0', 52), nameOf(id))
  return span
}

function showResult(s) {
  const card = $('overlay-card')
  card.innerHTML = ''
  const booted = s.booted
  const meOut = booted.includes(client.me)
  if (meOut) audio.sfx('boot')
  else if (booted.length) audio.sfx('kick-out')
  const h = document.createElement('h2')
  h.textContent = !booted.length ? 'Phew! Nobody out' : meOut ? 'You got BOOTED! 🥾' : booted.length === 1 ? `${nameOf(booted[0])} is out!` : `${booted.length} players booted!`
  card.appendChild(h)
  if (booted.length) {
    const list = document.createElement('div')
    list.className = 'booted-list'
    booted.forEach((id) => list.appendChild(chip(id)))
    card.appendChild(list)
  }
  const alive = Object.values(s.status).filter((x) => x.alive).length
  const p = document.createElement('p')
  p.textContent = alive <= 1 ? 'And then there was one…' : `${alive} left · next round ${s.nextChairs} chair${s.nextChairs === 1 ? '' : 's'}`
  card.appendChild(p)
  if (meOut) {
    const q = document.createElement('p')
    q.textContent = 'Stick around and cheer the others on with reactions 🎉'
    card.appendChild(q)
  }
  $('overlay').hidden = false
}

function showWinner(s) {
  const card = $('overlay-card')
  card.innerHTML = ''
  const h = document.createElement('h2')
  const champ = s.champion
  h.textContent = champ === client.me ? '🏆 YOU WIN! 🏆' : `🏆 ${nameOf(champ)} wins!`
  card.appendChild(h)
  const p = document.createElement('p')
  p.textContent = champ ? `Champion of the dance floor · ${s.status[champ]?.wins || 1} win${(s.status[champ]?.wins || 1) > 1 ? 's' : ''} tonight` : 'Game over'
  card.appendChild(p)
  if (client.isHost) {
    const row = document.createElement('div')
    row.className = 'row'
    const again = document.createElement('button')
    again.className = 'btn primary'
    again.textContent = '🔁 Play again'
    again.onclick = () => client.cmd('start')
    const lobby = document.createElement('button')
    lobby.className = 'btn'
    lobby.textContent = 'Back to lobby'
    lobby.onclick = () => client.cmd('lobby')
    row.append(again, lobby)
    card.appendChild(row)
  } else {
    const q = document.createElement('p')
    q.textContent = 'Waiting for the host to start another game…'
    card.appendChild(q)
  }
  $('overlay').hidden = false
}

function updateHud() {
  const s = client?.state
  if (!s || s.phase === 'lobby') return
  const r = s.round
  const alive = Object.values(s.status).filter((x) => x.alive).length
  $('hud-round').textContent = r ? `Round ${r.no} · ${LAYOUT_NAMES[r.layout] || ''}` : ''
  const free = s.owners.filter((o) => !o).length
  $('hud-count').textContent = `👥 ${alive} · 🪑 ${s.phase === 'scramble' ? `${free} free` : r?.m ?? 0}`
  const st = $('hud-status')
  st.className = 'pill status'
  const me = client.status()
  const hint = $('hint')
  hint.hidden = true
  if (s.phase === 'intro') st.textContent = 'Get ready…'
  else if (s.phase === 'music') {
    st.classList.add('dance')
    const seg = client.round && segmentAt(client.round.segs, client.danceTau())
    st.textContent = `🎵 ${audio.trackName() || 'Dance!'}${seg ? ' · ' + PATTERN_NAMES[seg.p] : ''}`
  } else if (s.phase === 'scramble') {
    st.classList.add('stop')
    st.textContent = '🛑 Music stopped — grab a chair!'
    if (me?.alive && me.seat < 0) {
      hint.hidden = false
      const touch = matchMedia('(pointer: coarse)').matches
      if (s.round?.motion === 'wild') hint.textContent = touch ? 'Chairs are running wild! Keep tapping to chase one!' : 'Chairs are running wild! Keep clicking / steering to catch one!'
      else hint.textContent = (s.round?.motion === 'drift' ? 'Chairs are drifting! ' : '') + (touch ? 'Tap a chair to chase it!' : 'WASD / arrows, or click a chair to chase it!')
    }
  } else if (s.phase === 'result') st.textContent = 'Round over'
  else if (s.phase === 'winner') st.textContent = '🏆 We have a champion'
  if (me && !me.alive && s.phase !== 'winner' && s.phase !== 'result') {
    hint.hidden = false
    hint.textContent = me.waiting ? 'Game in progress — you\'ll join the next one!' : 'You\'re out — cheer them on! 🎉'
  }
  const dj = client.isHost && s.phase === 'music'
  $('stop-btn').hidden = !dj
}

function renderSideRoster() {
  const box = $('side-roster')
  const s = client?.state
  if (!s || !client.roster) return
  box.innerHTML = ''
  const list = [...client.roster.values()].filter((p) => !p.spectator && s.status[p.id])
  list.sort((a, b) => (s.status[b.id].alive - s.status[a.id].alive) || (s.status[b.id].out - s.status[a.id].out))
  for (const p of list.slice(0, 24)) {
    const st = s.status[p.id]
    const d = document.createElement('div')
    if (!st.alive) d.className = 'out'
    d.append(avatarEl(p.avatar, 44), p.name)
    if (st.alive && st.seat >= 0 && s.phase === 'scramble') {
      const ok = document.createElement('span')
      ok.className = 'seat'
      ok.textContent = '✔'
      d.append(ok)
    }
    if (st.wins) d.append(' 🏆'.repeat(Math.min(3, st.wins)))
    box.appendChild(d)
  }
}

// --- Input -----------------------------------------------------------------------------

const MOVE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'])
window.addEventListener('keydown', (e) => {
  if (!client || e.target.tagName === 'INPUT') return
  if (MOVE_KEYS.has(e.key)) { client.input.keys.add(e.key); e.preventDefault() }
  if (e.key === ' ' && client.isHost && client.state?.phase === 'music') { client.cmd('stop'); e.preventDefault() }
  if (e.key === 'm' || e.key === 'M') toggleMute()
  const n = parseInt(e.key, 10)
  if (n >= 1 && n <= EMOJIS.length) client.react(EMOJIS[n - 1])
})
window.addEventListener('keyup', (e) => { if (client) client.input.keys.delete(e.key) })
window.addEventListener('blur', () => client && client.input.keys.clear())

let dragging = false
function aim(e) {
  if (!client || client.state?.phase !== 'scramble') return
  const p = renderer.toWorld(e.clientX, e.clientY)
  // Snap to a chair if you clicked on (or near) one.
  const chairs = client.chairPoints()
  // Wild chairs: a click is just a spot to run to — by the time you get there
  // the chair has moved on, so you have to keep hunting. Calmer modes lock on.
  if (client.state.round?.motion === 'wild') return client.setTarget(p)
  let best = -1
  let bd = CHAIR_RADIUS * 2
  chairs.forEach((c, i) => {
    const d = Math.hypot(c.x - p.x, c.y - p.y)
    if (d < bd && !client.state.owners[i]) { bd = d; best = i }
  })
  client.setTarget(best >= 0 ? { chair: best } : p)
}
$('stage').addEventListener('pointerdown', (e) => { dragging = true; aim(e) })
window.addEventListener('pointermove', (e) => { if (dragging) aim(e) })
window.addEventListener('pointerup', () => { dragging = false })

// --- Frame loop -------------------------------------------------------------------------

let last = performance.now()
let hudTick = 0
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  if (client) client.update(dt)
  renderer.padRight = client?.state?.phase === 'lobby' && innerWidth > 820 ? 400 : 0
  renderer.draw(client, { dt, pulse: audio.pulse(Date.now()), phaseAge: (now - phaseStart) / 1000 })
  if ((hudTick += dt) > 0.25) { hudTick = 0; if (client?.state?.phase === 'music') updateHud() }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
