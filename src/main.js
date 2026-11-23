import './styles.css'
import qrcode from 'qrcode-generator'
import { Hub } from './hub.js'
import { GameClient } from './client.js'
import { hostRoom, joinRoom, localLink } from './net.js'
import { Renderer, THEME_INFO } from './render.js'
import { SoundEngine, TRACKS, roundTrack } from './audio.js'
import { LOOK_KEYS, avatarEl, photoToAvatar, lookName, randomLook, bodyOf, withPhoto, photoOf } from './avatars.js'
import { CHAIR_RADIUS, LAYOUT_NAMES, PATTERN_NAMES, HAZARD_NAMES, segmentAt, chairCount, LEVELS, DEFAULT_LEVEL, TOTAL_LEVELS, POINTS } from './core.js'
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

// Old saves held emoji keys ('p3') or a bare photo: turn them into a person.
let avatar = store.get('mc_avatar', '')
if (!/^[mw]\d+(\|data:image)?/.test(avatar)) avatar = withPhoto(randomLook(), avatar.startsWith('data:image') ? avatar : null)
let myPhoto = photoOf(avatar) || store.get('mc_photo', '') || null
$('nick').value = store.get('mc_name', '')

// --- Home screen ---------------------------------------------------------------------

function renderAvatarGrid() {
  const grid = $('avatars')
  grid.innerHTML = ''
  // Row 1: men, row 2: women, then "your photo" (your chosen person wearing your face).
  const opts = [...LOOK_KEYS]
  if (myPhoto) opts.push(withPhoto(bodyOf(avatar), myPhoto))
  for (const key of opts) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = key === avatar ? 'on' : ''
    b.title = key.includes('|') ? 'Your photo' : lookName(key)
    b.setAttribute('aria-label', b.title)
    b.appendChild(avatarEl(key, 48))
    b.onclick = () => { avatar = key; store.set('mc_avatar', key); renderAvatarGrid() }
    grid.appendChild(b)
  }
}
renderAvatarGrid()

$('photo').onchange = async (e) => {
  const f = e.target.files[0]
  if (!f) return
  try {
    myPhoto = await photoToAvatar(f)
    store.set('mc_photo', myPhoto)
    avatar = withPhoto(bodyOf(avatar), myPhoto)
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
      ...(FAST ? { timing: { intro: 1800, result: 2000, scrambleMax: 7000, settle: 500, levelup: 2500 }, musicScale: 0.3 } : {}),
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
  client.on('welcome', () => { $('host-settings').hidden = !client.isHost; $('host-start').hidden = !client.isHost; $('guest-wait').hidden = client.isHost; $('host-ctl').hidden = !client.isHost })
  client.on('roster', () => { renderRoster(); renderSideRoster() })
  client.on('state', onState)
  client.on('react', (id, e) => renderer.react(id, e))
  client.on('denied', () => { audio.sfx('denied'); try { navigator.vibrate?.([20, 40, 20]) } catch {} })
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
  $('lobby-note').textContent = playing.length < 2 ? 'Waiting for at least 2 players…' : `${playing.length} players · ${TOTAL_LEVELS} levels · ${chairCount(playing.length, client.state?.settings?.mode)} chairs in round 1`
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

// The lobby panel scrolls: show a "more below" hint until you reach the end,
// and let the mouse wheel scroll it from anywhere on the page (not only when
// the pointer happens to be over the panel).
const lobbyBody = document.querySelector('.lobby-body')
function updateMoreHint() {
  const left = lobbyBody.scrollHeight - lobbyBody.scrollTop - lobbyBody.clientHeight
  $('lobby-more').hidden = left < 12 || getComputedStyle(lobbyBody).overflowY !== 'auto'
}
lobbyBody.addEventListener('scroll', updateMoreHint, { passive: true })
window.addEventListener('resize', updateMoreHint)
new ResizeObserver(updateMoreHint).observe(lobbyBody)
window.addEventListener('wheel', (e) => {
  if ($('lobby').hidden || lobbyBody.contains(e.target)) return
  lobbyBody.scrollBy({ top: e.deltaY * (e.deltaMode === 1 ? 32 : 1) })
}, { passive: true })
$('stop-btn').onclick = () => client.cmd('stop')
$('end-btn').onclick = () => {
  if (confirm('End the game now? Everyone keeps their points and the final podium is shown.')) client.cmd('end')
}
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
    $(segId).querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === String(s.settings[key])))
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
        const st = s.status[o]
        if (st?.gain) {
          const first = s.round?.fastest?.id === o
          const secs = st.sitMs != null ? `  ⚡${(st.sitMs / 1000).toFixed(2)}s` : ''
          const tag = BONUS_TAGS[st.bonus]
          const color = st.bonus === 'jackpot' ? '#ff6ef2' : st.bonus ? (BONUS_TAGS[st.bonus].pop.includes('🥈') || st.bonus === 'silvertile' ? '#dfe9f5' : '#ffd54a') : first ? '#ffd54a' : '#7cff9e'
          renderer.popText(o, `${tag ? tag.pop + ' ' : first ? 'FIRST! ' : ''}+${st.gain}${o === client.me ? secs : ''}`, color, o === client.me || st.bonus === 'jackpot')
          if (st.bonus === 'jackpot' && c) { renderer.burst(c.x, c.y, '#ffd54a', 60); renderer.burst(c.x, c.y, '#ff6ef2', 40) }
          if (st.bonus && o !== client.me) toast(`${tag.icon} ${nameOf(o)} ${tag.verb}!`)
        }
        if (o === client.me) {
          const tag = BONUS_TAGS[st?.bonus]
          banner(tag ? tag.banner : 'SAFE! 🪑')
          if (st?.bonus) audio.sfx('win')
          client.input.target = null
        }
      }
    })
  }
  updateHud()
  renderSideRoster()
  renderPredict()
}

function onPhase(phase, prevPhase, s) {
  countdownTimers.forEach(clearTimeout)
  countdownTimers = []
  $('overlay').hidden = true
  const r = s.round
  if (phase === 'intro') {
    // Line the countdown up with the host's music-start moment.
    const localMusic = r.musicAt - client.offset
    audio.play(r.m === 1 ? 'final' : roundTrack(r.track), localMusic)
    previewing = false
    for (const n of [3, 2, 1]) {
      const at = localMusic - n * 1000 - Date.now()
      if (at > -200) countdownTimers.push(setTimeout(() => { banner(String(n)); audio.sfx('tick') }, Math.max(0, at)))
    }
    countdownTimers.push(setTimeout(() => banner('DANCE!'), Math.max(0, localMusic - Date.now())))
    if (r.no === 1) {
      const L = LEVELS[r.level] || LEVELS[DEFAULT_LEVEL]
      banner(`LEVEL ${r.level}`)
      toast(`Level ${r.level} of ${TOTAL_LEVELS}: ${L.name} · ${L.blurb}`)
    } else if (r.thrones?.length) toast(`👑 ${r.thrones.length} throne${r.thrones.length > 1 ? 's' : ''} · 🥈 ${r.silvers?.length || 0} silver · ✨ gold & silver tiles pay extra`)
  } else if (phase === 'music') {
    if (!audio.playing) audio.play(r.m === 1 ? 'final' : roundTrack(r.track), r.musicAt - client.offset)
  } else if (phase === 'scramble') {
    audio.stop(true)
    renderer.flash('#ff2f4f', 0.18)
    banner('SIT!', true)
  } else if (phase === 'result') {
    audio.stop(false)
    showResult(s)
  } else if (phase === 'levelup') {
    audio.stop(false)
    renderer.pops = []
    renderer.confetti(140)
    audio.sfx('win')
    showLevelUp(s)
  } else if (phase === 'winner') {
    audio.stop(false)
    renderer.pops = []
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
  p.textContent = alive <= 1
    ? (s.level >= s.levels ? 'That was the final level!' : `Level ${s.level} done. Everyone's back in for level ${s.level + 1}!`)
    : `${alive} left · next round ${s.nextChairs} chair${s.nextChairs === 1 ? '' : 's'}`
  card.appendChild(p)
  // the round's highlights
  const facts = document.createElement('div')
  facts.className = 'facts'
  if (s.levelChamp) facts.append(fact('🏅', `<b>${esc(nameOf(s.levelChamp))}</b> wins level ${s.level}! <b>+${POINTS.levelWin}</b>`))
  const fast = s.round?.fastest
  if (fast) facts.append(fact('⚡', `Fastest: <b>${esc(nameOf(fast.id))}</b> in ${(fast.ms / 1000).toFixed(2)}s`))
  for (const [id, st] of Object.entries(s.status)) {
    const tag = BONUS_TAGS[st.bonus]
    if (tag) facts.append(fact(tag.icon, `<b>${esc(nameOf(id))}</b> ${tag.verb}`))
  }
  const mine = s.status[client.me]
  if (mine && !client.roster.get(client.me)?.spectator) {
    if (mine.gain) facts.append(fact('⭐', `You scored <b>+${mine.gain}</b>${mine.streak > 1 ? ` · 🔥 ${mine.streak}-round streak` : ''} · total <b>${mine.pts}</b>`))
    if (mine.pred === 'hit') { facts.append(fact('🔮', `You called it! <b>+200</b>`)); audio.sfx('win') }
    else if (mine.pred === 'miss') facts.append(fact('🔮', `Not this time: you picked ${esc(nameOf(mine.pick))}`))
  }
  if (facts.childNodes.length) card.appendChild(facts)
  if (meOut) {
    const q = document.createElement('p')
    q.textContent = alive <= 1 ? 'Your points are safe, and you\'re back in next level!' : "You keep your points! Call who goes out next to score more 🔮 — you're back in next level"
    card.appendChild(q)
  }
  $('overlay').hidden = false
}

// Top three by points, then a few awards.
function podium(s) {
  const box = document.createElement('div')
  box.className = 'podium'
  const players = [...client.roster.values()].filter((p) => !p.spectator && s.status[p.id] && !s.status[p.id].waiting)
  const ranked = players.slice().sort((a, b) => s.status[b.id].pts - s.status[a.id].pts)
  const steps = document.createElement('div')
  steps.className = 'steps'
  ;[1, 0, 2].forEach((rank) => {
    const p = ranked[rank]
    if (!p) return
    const col = document.createElement('div')
    col.className = 'step r' + (rank + 1) + (p.id === client.me ? ' me' : '')
    col.append(avatarEl(p.avatar, 40))
    const n = document.createElement('b')
    n.textContent = p.name
    const pts = document.createElement('span')
    pts.textContent = s.status[p.id].pts + ' pts'
    const block = document.createElement('i')
    block.textContent = ['🥇', '🥈', '🥉'][rank]
    col.append(n, pts, block)
    steps.appendChild(col)
  })
  box.appendChild(steps)
  const myRank = ranked.findIndex((p) => p.id === client.me)
  if (myRank >= 3) box.append(fact('📊', `You finished <b>#${myRank + 1}</b> with ${s.status[client.me].pts} pts`))
  const st = (p) => s.status[p.id]
  const top = (list, by) => list.slice().sort(by)[0]
  const quick = top(players.filter((p) => st(p).bestSit != null), (a, b) => st(a).bestSit - st(b).bestSit)
  if (quick) box.append(fact('⚡', `Quickest sit: <b>${esc(quick.name)}</b> ${(st(quick).bestSit / 1000).toFixed(2)}s`))
  const streak = top(players.filter((p) => st(p).bestStreak > 1), (a, b) => st(b).bestStreak - st(a).bestStreak)
  if (streak) box.append(fact('🔥', `Longest streak: <b>${esc(streak.name)}</b> · ${st(streak).bestStreak} rounds`))
  const seer = top(players.filter((p) => st(p).predHits > 0), (a, b) => st(b).predHits - st(a).predHits)
  if (seer) box.append(fact('🔮', `Best fortune teller: <b>${esc(seer.name)}</b> · ${st(seer).predHits} called`))
  const king = top(players.filter((p) => st(p).thrones > 0), (a, b) => st(b).thrones - st(a).thrones)
  if (king) box.append(fact('👑', `Throne collector: <b>${esc(king.name)}</b> · ${st(king).thrones} throne${st(king).thrones > 1 ? 's' : ''}`))
  const tiles = top(players.filter((p) => st(p).tiles > 0), (a, b) => st(b).tiles - st(a).tiles)
  if (tiles) box.append(fact('✨', `Tile hunter: <b>${esc(tiles.name)}</b> · ${st(tiles).tiles} bonus tile${st(tiles).tiles > 1 ? 's' : ''}`))
  const jack = top(players.filter((p) => st(p).jackpots > 0), (a, b) => st(b).jackpots - st(a).jackpots)
  if (jack) box.append(fact('💎', `Jackpot hunter: <b>${esc(jack.name)}</b> · ${st(jack).jackpots} jackpot${st(jack).jackpots > 1 ? 's' : ''}`))
  const lv = top(players.filter((p) => st(p).wins > 0), (a, b) => st(b).wins - st(a).wins)
  if (lv) box.append(fact('🏅', `Most levels won: <b>${esc(lv.name)}</b> · ${st(lv).wins}`))
  return box
}

function fact(icon, html) {
  const d = document.createElement('div')
  d.className = 'fact'
  d.innerHTML = `<span>${icon}</span><span>${html}</span>`
  return d
}

function esc(t) {
  return String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

function showWinner(s) {
  const card = $('overlay-card')
  card.innerHTML = ''
  const h = document.createElement('h2')
  const champ = s.champion
  h.textContent = champ === client.me ? '🏆 YOU WIN! 🏆' : champ ? `🏆 ${nameOf(champ)} wins!` : 'Game over'
  card.appendChild(h)
  const p = document.createElement('p')
  const played = s.round?.level || s.level
  p.textContent = champ ? `Most points after ${played >= s.levels ? `all ${s.levels} levels` : `${played} level${played > 1 ? 's' : ''}`} · ${s.status[champ]?.pts || 0} pts` : 'Game over'
  card.appendChild(p)
  card.appendChild(podium(s))
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

const BONUS_TAGS = {
  jackpot: { pop: '💎 JACKPOT', banner: 'JACKPOT! 💎', verb: 'hit the JACKPOT: a throne on a gold tile', icon: '💎' },
  royal: { pop: '👑 ROYAL', banner: 'ROYAL COMBO! 👑', verb: 'took a throne on a silver tile', icon: '👑' },
  golden: { pop: '🥈✨ COMBO', banner: 'SILVER ON GOLD! ✨', verb: 'took a silver chair on a gold tile', icon: '✨' },
  sterling: { pop: '🥈 STERLING', banner: 'STERLING COMBO! 🥈', verb: 'took a silver chair on a silver tile', icon: '🥈' },
  throne: { pop: '👑 THRONE', banner: 'THRONE! 👑', verb: 'took a throne', icon: '👑' },
  silver: { pop: '🥈 SILVER', banner: 'SILVER CHAIR! 🥈', verb: 'took a silver chair', icon: '🥈' },
  gold: { pop: '✨ GOLD', banner: 'GOLD TILE! ✨', verb: 'sat on a gold tile', icon: '✨' },
  silvertile: { pop: '◇ SILVER TILE', banner: 'SILVER TILE! ◇', verb: 'sat on a silver tile', icon: '◇' },
}

// Between levels: who won it, the leaderboard so far, and what's next.
function showLevelUp(s) {
  const card = $('overlay-card')
  card.innerHTML = ''
  const h = document.createElement('h2')
  h.textContent = `Level ${s.level} complete!`
  card.appendChild(h)
  if (s.levelChamp) {
    const w = document.createElement('div')
    w.className = 'booted-list'
    w.appendChild(chip(s.levelChamp))
    card.appendChild(w)
    const p = document.createElement('p')
    p.textContent = `${s.levelChamp === client.me ? 'You' : nameOf(s.levelChamp)} won the level · +${POINTS.levelWin}`
    card.appendChild(p)
  }
  card.appendChild(leaderboard(s, 5))
  const next = LEVELS[s.level + 1]
  const n = document.createElement('p')
  n.className = 'next-level'
  n.innerHTML = `Everyone's back in! Next up: <b>Level ${s.level + 1} · ${esc(next?.name || '')}</b> · ${esc(next?.blurb || '')}`
  card.appendChild(n)
  $('overlay').hidden = false
}

function leaderboard(s, max) {
  const box = document.createElement('div')
  box.className = 'facts'
  const ranked = [...client.roster.values()].filter((p) => !p.spectator && s.status[p.id] && !s.status[p.id].waiting)
    .sort((a, b) => s.status[b.id].pts - s.status[a.id].pts)
  ranked.slice(0, max).forEach((p, i) => box.append(fact(['🥇', '🥈', '🥉'][i] || `#${i + 1}`, `<b>${esc(p.name)}</b> · ${s.status[p.id].pts} pts`)))
  const me = ranked.findIndex((p) => p.id === client.me)
  if (me >= max) box.append(fact('📊', `You're <b>#${me + 1}</b> with ${s.status[client.me].pts} pts`))
  return box
}

function updateHud() {
  const s = client?.state
  if (!s || s.phase === 'lobby') return
  const r = s.round
  const alive = Object.values(s.status).filter((x) => x.alive).length
  const lvl = r?.level || DEFAULT_LEVEL
  $('hud-round').textContent = r ? `Level ${lvl}/${s.levels || TOTAL_LEVELS} ${LEVELS[lvl]?.name || ''} · Round ${r.no} · ${LAYOUT_NAMES[r.layout] || ''}` : ''
  const hz = (client.round?.hazards || []).map((h) => HAZARD_NAMES[h]).join(' · ')
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
    if (hz && me?.alive) {
      hint.hidden = false
      hint.textContent = `⚠️ Incoming: ${hz}`
    }
  } else if (s.phase === 'scramble') {
    st.classList.add('stop')
    st.textContent = '🛑 Music stopped — grab a chair!'
    if (me?.alive && me.seat < 0) {
      hint.hidden = false
      const touch = matchMedia('(pointer: coarse)').matches
      hint.textContent = touch ? 'Tap a free chair to grab it!' : 'Click a free chair to grab it (or steer with WASD / arrows)'
    }
  } else if (s.phase === 'result') st.textContent = 'Round over'
  else if (s.phase === 'levelup') st.textContent = `⬆️ Level ${s.level + 1} coming up`
  else if (s.phase === 'winner') st.textContent = '🏆 We have a champion'
  if (me && !me.alive && !['winner', 'result', 'levelup'].includes(s.phase)) {
    hint.hidden = false
    hint.textContent = me.waiting ? 'Game in progress — you\'ll join at the next level!' : 'Out this level, back in next! Keep scoring: call who\'s next 🔮'
  }
  const dj = client.isHost && s.phase === 'music'
  $('stop-btn').hidden = !dj
  $('end-btn').hidden = s.phase === 'winner'
}

// The jumbotron: every player's name and where they stand right now.
function playerState(s, p, st) {
  if (st.waiting) return ['NEXT LEVEL', 'wait']
  if (s.phase === 'winner') return s.champion === p.id ? ['CHAMPION', 'champ'] : ['FINISHED', 'out']
  if (s.phase === 'levelup') return s.levelChamp === p.id ? ['LEVEL WIN', 'champ'] : ['BACK IN', 'dancing']
  if (!st.alive) {
    if (s.phase === 'result' && s.booted?.includes(p.id)) return ['BOOTED!', 'booted']
    return [st.out ? `OUT · R${st.out}` : 'OUT', 'out']
  }
  if (s.phase === 'scramble') return st.seat >= 0 ? ['SEATED', 'seated'] : ['RUNNING', 'running']
  if (s.phase === 'result') return s.booted?.includes(p.id) ? ['BOOTED!', 'booted'] : ['SAFE', 'seated']
  if (s.phase === 'music') return ['DANCING', 'dancing']
  return ['READY', 'dancing']
}

function renderSideRoster() {
  const box = $('side-roster')
  const s = client?.state
  if (!s || !client.roster) return
  const list = [...client.roster.values()].filter((p) => !p.spectator && s.status[p.id])
  const rank = (p) => {
    const st = s.status[p.id]
    if (s.phase === 'winner' || s.phase === 'levelup') return 0 // straight points ranking
    if (st.alive) return st.seat >= 0 && s.phase === 'scramble' ? 1 : 2
    if (st.waiting) return 5
    return 3 + (st.out ? 1 - st.out / 1000 : 1)
  }
  list.sort((a, b) => rank(a) - rank(b) || (s.status[b.id].pts || 0) - (s.status[a.id].pts || 0) || a.name.localeCompare(b.name))
  const alive = list.filter((p) => s.status[p.id].alive).length
  const out = list.filter((p) => !s.status[p.id].alive && !s.status[p.id].waiting).length
  box.innerHTML = ''
  const head = document.createElement('div')
  head.className = 'jt-head'
  head.innerHTML = `<span>MUSICAL CHAIRS</span><b>${s.round ? `LEVEL ${s.round.level}/${s.levels} · R${s.round.no}` : ''}</b>`
  const sub = document.createElement('div')
  sub.className = 'jt-sub'
  sub.innerHTML = s.phase === 'winner' ? '<b>FINAL SCORES</b>' : s.phase === 'levelup' ? `<b>STANDINGS</b> <i>·</i> LEVEL ${s.level + 1} NEXT` : `<b>${alive}</b> STILL IN <i>·</i> <b class="o">${out}</b> OUT`
  const rows = document.createElement('div')
  rows.className = 'jt-list'
  const MAX = 22
  for (const p of list.slice(0, MAX)) {
    const st = s.status[p.id]
    const [label, cls] = playerState(s, p, st)
    const row = document.createElement('div')
    row.className = 'jt-row st-' + cls + (p.id === client.me ? ' me' : '')
    const dot = document.createElement('i')
    dot.style.background = p.color
    const name = document.createElement('span')
    name.className = 'jt-name'
    name.textContent = p.name + (st.wins ? ' ' + '🏆'.repeat(Math.min(3, st.wins)) : '')
    const pts = document.createElement('span')
    pts.className = 'jt-pts'
    pts.textContent = st.pts || 0
    const tag = document.createElement('span')
    tag.className = 'jt-st'
    tag.textContent = label
    row.append(dot, name, pts, tag)
    rows.appendChild(row)
  }
  if (list.length > MAX) {
    const more = document.createElement('div')
    more.className = 'jt-more'
    more.textContent = `+${list.length - MAX} more`
    rows.appendChild(more)
  }
  box.append(head, sub, rows)
}

// Out players: "Who's out next?" Pick someone during the countdown or the
// music; it locks when the music stops; a correct call scores 200.
function renderPredict() {
  const box = $('predict')
  const s = client?.state
  const me = s?.status?.[client.me]
  const open = s && me && !me.alive && !client.roster.get(client.me)?.spectator && (s.phase === 'intro' || s.phase === 'music' || s.phase === 'scramble')
  if (!open) { box.hidden = true; return }
  const alive = [...client.roster.values()].filter((p) => s.status[p.id]?.alive)
  if (alive.length < 2) { box.hidden = true; return }
  const locked = s.phase === 'scramble'
  box.hidden = false
  box.innerHTML = ''
  const h = document.createElement('div')
  h.className = 'pr-head'
  h.innerHTML = locked
    ? (me.pick ? `🔮 You picked <b>${esc(nameOf(me.pick))}</b>. Fingers crossed!` : '🔮 Too late to pick this round')
    : '🔮 <b>Who\'s out next?</b> Call it for +200'
  box.appendChild(h)
  if (locked) return
  const row = document.createElement('div')
  row.className = 'pr-row'
  for (const p of alive) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = me.pick === p.id ? 'on' : ''
    b.append(avatarEl(p.avatar, 26), p.name)
    b.onclick = () => { client.pick(p.id); audio.sfx('lock') }
    row.appendChild(b)
  }
  box.appendChild(row)
}

// Hurry-up timer: counts down the time left to grab a chair once the music
// stops, turning amber then red, ticking (and buzzing) through the last 3s.
let lastTickSec = -1
function renderTimer() {
  const box = $('timer')
  const s = client?.state
  const r = s?.round
  if (!s || s.phase !== 'scramble' || !r?.scrambleEnd || s.settle) { box.hidden = true; lastTickSec = -1; return }
  const me = s.status[client.me]
  const hunting = me?.alive && me.seat < 0
  const total = r.scrambleEnd - r.stopAt
  const left = Math.max(0, r.scrambleEnd - client.hostNow())
  const secs = Math.ceil(left / 1000)
  const frac = left / total
  box.hidden = false
  box.className = 'timer' + (frac < 0.25 ? ' red' : frac < 0.55 ? ' amber' : '') + (hunting ? ' me' : '')
  $('timer-n').textContent = secs
  $('timer-label').textContent = !me?.alive ? 'left to sit' : me.seat >= 0 ? "you're safe!" : secs <= 3 ? 'HURRY!' : 'grab a chair!'
  $('timer-bar').style.width = (frac * 100).toFixed(1) + '%'
  if (hunting && secs <= 3 && secs > 0 && secs !== lastTickSec) {
    lastTickSec = secs
    audio.sfx('tick')
    try { navigator.vibrate?.(15) } catch {}
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
// Clicks and taps only count once the music stops; during the dance they're ignored.
function aim(e, fresh) {
  if (!client || client.state?.phase !== 'scramble') return
  const me = client.status()
  if (!me?.alive || me.seat >= 0) return
  // Click ON a chair (anywhere on its picture, not just its floor spot) to
  // lock on: you chase it until you sit. Anywhere else: run to that spot.
  const touch = e.pointerType === 'touch'
  const i = renderer.pickChair(e.clientX, e.clientY, client, touch ? 1.6 : 1.25)
  const cur = client.input.target
  if (i >= 0) {
    // grab it: sit straight away, with a little buzz on phones
    if (fresh && client.grab(i)) {
      audio.sfx('lock')
      try { navigator.vibrate?.(35) } catch {}
    }
  } else if (fresh) {
    const p = renderer.toWorld(e.clientX, e.clientY)
    if (client.setTarget(p) && fresh) renderer.spotFx(p)
  }
}
$('stage').addEventListener('pointerdown', (e) => { dragging = true; aim(e, true) })
window.addEventListener('pointermove', (e) => { if (dragging) aim(e, false) })
window.addEventListener('pointerup', () => { dragging = false })

// --- Frame loop -------------------------------------------------------------------------

let last = performance.now()
let prevFrame = last
let hudTick = 0
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  if (client) {
    // Move in real time even if frames are slow: substep instead of capping.
    client.viewYaw = renderer.yaw
    let rem = Math.min(0.25, (now - prevFrame) / 1000)
    while (rem > 1e-4) { const step = Math.min(0.05, rem); client.update(step); rem -= step }
  }
  prevFrame = now
  const ph = client?.state?.phase
  if (ph === 'lobby') {
    renderer.padLeft = 0
    renderer.padRight = innerWidth > 820 ? 400 : 0
  } else if (innerWidth > 820) {
    // Wide, equal margins so the player list down the left never covers the board.
    // room for the jumbotron on the left, and enough on the right that the
    // deck's front-right corner (and its tiki torch) stays on screen
    renderer.padLeft = Math.min(($('side-roster').offsetWidth || 0) + 16, innerWidth * 0.26)
    renderer.padRight = Math.min(90, innerWidth * 0.07)
  } else renderer.padLeft = renderer.padRight = 0
  renderer.draw(client, { dt, pulse: audio.pulse(Date.now()), phaseAge: (now - phaseStart) / 1000 })
  renderTimer()
  if ((hudTick += dt) > 0.25) { hudTick = 0; if (client?.state?.phase === 'music') updateHud() }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
