import { Peer } from 'peerjs'

// Networking: PeerJS (WebRTC data channels) with the public PeerJS broker for
// signalling. The host's browser runs the Hub; everybody connects straight to
// it (star topology). PeerJS's default ICE config includes STUN plus its free
// TURN relays, which matters on locked-down office networks.
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

function peerOpts() {
  const q = new URLSearchParams(location.search)
  const o = { debug: Number(q.get('peerdebug') || 1) }
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
export function hostRoom(hub, code) {
  return new Promise((resolve, reject) => {
    const room = code || randomRoom()
    const peer = new Peer(ROOM_PREFIX + room, peerOpts())
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
export function joinRoom(code) {
  return new Promise((resolve, reject) => {
    const peer = new Peer(peerOpts())
    let settled = false
    const fail = (e) => { if (!settled) { settled = true; reject(e); try { peer.destroy() } catch {} } }
    const timeout = setTimeout(() => fail(new Error('timeout')), 15000)
    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') fail(new Error('Room not found — check the code, or ask the host to keep their tab open.'))
      else if (!settled) fail(err)
      else console.warn('[client] peer error', err.type)
    })
    peer.on('open', () => {
      const conn = peer.connect(ROOM_PREFIX + code.toUpperCase(), { serialization: 'json', reliable: true })
      const link = new Link((msg) => { try { if (conn.open) conn.send(msg) } catch {} }, () => { try { peer.destroy() } catch {} })
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
