// Timers that keep ticking when the host's tab is in the background.
//
// Browsers throttle setTimeout/setInterval in hidden tabs (to 1/sec, or even
// 1/min after a while). The host's tab IS the game server, so if the host
// alt-tabs to a video call the rounds would stall. Timers inside a dedicated
// Worker aren't throttled that way, so we run the clock there and get called
// back by message.

const SRC = `
const t = new Map()
onmessage = (e) => {
  const { op, id, ms } = e.data
  if (op === 'set') t.set(id, setTimeout(() => { t.delete(id); postMessage(id) }, ms))
  else if (op === 'every') t.set(id, setInterval(() => postMessage(id), ms))
  else if (op === 'clear') { clearTimeout(t.get(id)); clearInterval(t.get(id)); t.delete(id) }
}`

export function workerTimers() {
  let worker
  try {
    worker = new Worker(URL.createObjectURL(new Blob([SRC], { type: 'text/javascript' })))
  } catch {
    return {} // fall back to the page's own timers
  }
  const fns = new Map()
  const once = new Set()
  let next = 1
  worker.onmessage = (e) => {
    const id = e.data
    const fn = fns.get(id)
    if (once.has(id)) { fns.delete(id); once.delete(id) }
    if (fn) fn()
  }
  return {
    setTimeout(fn, ms) {
      const id = next++
      fns.set(id, fn)
      once.add(id)
      worker.postMessage({ op: 'set', id, ms })
      return id
    },
    clearTimeout(id) {
      if (!id) return
      fns.delete(id); once.delete(id)
      worker.postMessage({ op: 'clear', id })
    },
    setInterval(fn, ms) {
      const id = next++
      fns.set(id, fn)
      worker.postMessage({ op: 'every', id, ms })
      return id
    },
    clearInterval(id) {
      if (!id) return
      fns.delete(id)
      worker.postMessage({ op: 'clear', id })
    },
  }
}
