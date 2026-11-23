import { Peer } from 'peerjs'

// Networking: PeerJS (WebRTC data channels) with the public PeerJS broker for
// signalling. The host's browser runs the Hub; everybody connects straight to
// it (star topology).
//
// Office networks: corporate firewalls usually block UDP and every port except
// 80/443, so a direct WebRTC link (and PeerJS's own free TURN relay, which only
// listens on 3478) never connects and joining times out. The fix is a TURN relay
// reachable over TLS on 443 ("turns:...:443?transport=tcp"), which looks like
// ordinary HTTPS to the firewall. Configure one at build time:
//   VITE_ICE_URL      an endpoint returning an iceServers array (e.g. Metered's
//                     https://<app>.metered.live/api/v1/turn/credentials?apiKey=...)
//   VITE_ICE_SERVERS  a static iceServers JSON array
// (or ?iceurl= / ?ice= in the page URL for testing). PeerJS's defaults stay as
// a fallback behind whatever is configured.
//
// A WebRTC channel does not reliably fire `close` when a laptop lid shuts, so
// clients ping every second (the pings double as clock sync) and the host
// evicts anyone silent for too long.

export const ROOM_PREFIX = 'mchairs-rave-'
const PING_MS = 1000
const EVICT_MS = 9000

// A message pipe the GameClient plugs into. Deliberately a class with methods:
// as a plain `{ onMessage: null }` literal, the production minifier folded
// `link.onMessage` to a constant and silently dropped every inbound message.
export class Link {
  constructor(send, destroy) {
    this._send = send
    this._destroy = destroy
    this.onMessage = null
    this.onClose = null
  }
  send(msg) { this._send(msg) }
  deliver(msg) { if (this.onMessage) this.onMessage(msg) }
  closed() { if (this.onClose) this.onClose() }
  destroy() { if (this._destroy) this._destroy() }
}

export function randomRoom() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

const PEERJS_ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
]

function parseIce(text) {
  try {
    const v = typeof text === 'string' ? JSON.parse(text) : text
    const list = Array.isArray(v) ? v : v?.iceServers
    return Array.isArray(list) ? list.filter((s) => s && s.urls) : []
  } catch { return [] }
}

let icePromise = null
export function iceServers() {
  if (icePromise) return icePromise
  icePromise = (async () => {
    const q = new URLSearchParams(location.search)
    const env = import.meta.env || {}
    const fixed = parseIce(q.get('ice') || env.VITE_ICE_SERVERS || '[]')
    const url = q.get('iceurl') || env.VITE_ICE_URL
    let fetched = []
    if (url) {
      try {
        const ctl = new AbortController()
        const t = setTimeout(() => ctl.abort(), 5000)
        const res = await fetch(url, { signal: ctl.signal })
        clearTimeout(t)
        if (res.ok) fetched = parseIce(await res.json())
      } catch (e) { console.warn('[net] could not fetch TURN credentials', e) }
    }
    const list = [...fetched, ...fixed, ...PEERJS_ICE]
    if (!fetched.length && !fixed.length) console.warn('[net] no TLS/443 TURN relay configured — players behind strict office firewalls may not be able to join')
    return list
  })()
  return icePromise
}

function peerOpts(ice) {
  const q = new URLSearchParams(location.search)
  const o = { debug: Number(q.get('peerdebug') || 1), config: { iceServers: ice } }
  // ?relay=1 forces every connection through TURN, to check the relay works.
  if (q.get('relay')) o.config.iceTransportPolicy = 'relay'
  // Tests can point at a local broker; production uses the PeerJS cloud.
  if (q.get('peerhost')) {
    o.host = q.get('peerhost')
    o.port = Number(q.get('peerport') || 9000)
    o.path = q.get('peerpath') || '/'
    o.secure = false
  }
  return o
}

// Host side: owns a Peer whose id is derived from the room code and feeds
// every DataConnection into the hub.
export async function hostRoom(hub, code) {
  const ice = await iceServers()
  return new Promise((resolve, reject) => {
    const room = code || randomRoom()
    const peer = new Peer(ROOM_PREFIX + room, peerOpts(ice))
    const lastSeen = new Map()
    let opened = false
    peer.on('open', () => {
      opened = true
      resolve({ room, peer, destroy: () => { clearInterval(sweep); peer.destroy() } })
    })
    peer.on('error', (err) => {
      if (!opened) reject(err)
      else console.warn('[host] peer error', err.type, err)
    })
    // Lost the signalling server (not the players) — reconnect quietly.
    peer.on('disconnected', () => { if (!peer.destroyed) setTimeout(() => peer.reconnect(), 1000) })
    peer.on('connection', (conn) => {
      const id = conn.connectionId
      conn.on('open', () => {
        lastSeen.set(id, Date.now())
        hub.connect(id, (msg) => { try { conn.send(msg) } catch {} })
      })
      conn.on('data', (d) => {
        lastSeen.set(id, Date.now())
        hub.message(id, d)
      })
      const drop = () => {
        if (!lastSeen.has(id)) return
        lastSeen.delete(id)
        hub.disconnect(id)
      }
      conn.on('close', drop)
      conn.on('error', drop)
      conns.set(id, conn)
    })
    const conns = new Map()
    const sweep = setInterval(() => {
      const now = Date.now()
      for (const [id, t] of [...lastSeen]) {
        if (now - t > EVICT_MS) {
          lastSeen.delete(id)
          try { conns.get(id)?.close() } catch {}
          conns.delete(id)
          hub.disconnect(id)
        }
      }
    }, 2000)
  })
}

// The host's own player talks to the hub through this in-memory link. JSON
// round-tripping keeps it honest: it behaves exactly like the wire.
export function localLink(hub) {
  const link = new Link((msg) => {
    const copy = JSON.parse(JSON.stringify(msg))
    queueMicrotask(() => hub.message('local', copy))
  })
  hub.connect('local', (msg) => {
    const copy = JSON.parse(JSON.stringify(msg))
    queueMicrotask(() => link.deliver(copy))
  })
  return link
}

// Player side: connect to a room's host.
const SIGNAL_BLOCKED = "Can't reach the game's connection server — your network (VPN, proxy or office firewall) may be blocking it. Try phone data or another network."
const P2P_BLOCKED = "Found the room but couldn't connect to the host — your network blocks peer-to-peer traffic. Try phone data or another network, or ask the host to set up a TURN relay (see README)."

export async function joinRoom(code) {
  const ice = await iceServers()
  return new Promise((resolve, reject) => {
    const peer = new Peer(peerOpts(ice))
    let settled = false
    let signalled = false
    const fail = (e) => { if (!settled) { settled = true; reject(e); try { peer.destroy() } catch {} } }
    // Relay candidates over TCP/TLS gather slower than direct ones, so allow a bit longer.
    const timeout = setTimeout(() => fail(new Error(signalled ? P2P_BLOCKED : SIGNAL_BLOCKED)), 25000)
    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') fail(new Error('Room not found — check the code, or ask the host to keep their tab open.'))
      else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) fail(new Error(SIGNAL_BLOCKED))
      else if (err.type === 'webrtc' || err.type === 'negotiation-failed') fail(new Error(P2P_BLOCKED))
      else if (!settled) fail(err)
      else console.warn('[client] peer error', err.type)
    })
    peer.on('open', () => {
      signalled = true
      const conn = peer.connect(ROOM_PREFIX + code.toUpperCase(), { serialization: 'json', reliable: true })
      const link = new Link((msg) => { try { if (conn.open) conn.send(msg) } catch {} }, () => { try { peer.destroy() } catch {} })
      conn.on('iceStateChanged', (st) => {
        console.info('[client] ICE', st)
        if (st === 'failed' && !settled) { clearTimeout(timeout); fail(new Error(P2P_BLOCKED)) }
      })
      conn.on('open', () => {
        clearTimeout(timeout)
        settled = true
        resolve(link)
      })
      conn.on('data', (d) => link.deliver(d))
      conn.on('close', () => link.closed())
      conn.on('error', () => link.closed())
    })
  })
}

export { PING_MS }
