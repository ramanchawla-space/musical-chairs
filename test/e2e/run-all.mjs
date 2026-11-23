// Runs the browser suite against the production build (vite preview) with a
// local PeerJS broker, so tests don't depend on the public cloud. The
// `cloud.mjs` suite then runs the same flow over the real PeerJS cloud.
//   npm run test:e2e            (expects `npm run build` first)
import { spawn } from 'child_process'
import { once } from 'events'
import { PeerServer } from 'peer'

const SUITE = [
  ['game.mjs', '5 browsers play a full game to a champion', {}],
  ['resilience.mjs', 'drop-outs, refresh, late joiners, big-screen host', {}],
  ['mobile.mjs', 'phone layout + touch controls', {}],
  ['levels.mjs', 'levels 4-5: obstacles and a spinning floor never hide the chairs', {}],
  ['cloud.mjs', 'real PeerJS cloud broker (production path)', { CLOUD: '1' }],
]

const PORT = 4199
const PEER_PORT = 9123
const peer = PeerServer({ port: PEER_PORT, path: '/' })
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] })
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('preview server did not start')), 30000)
  server.stdout.on('data', (d) => { if (d.toString().includes('localhost')) { clearTimeout(t); resolve() } })
  server.on('exit', (c) => reject(new Error('preview exited ' + c)))
})
console.log(`preview on :${PORT}, peer broker on :${PEER_PORT}`)

const only = process.argv[2]
let failed = 0
for (const [file, desc, env] of SUITE) {
  if (only && !file.startsWith(only)) continue
  console.log(`\n=== ${file} — ${desc} ===`)
  const child = spawn('node', [`test/e2e/${file}`], { stdio: 'inherit', env: { ...process.env, PEER_PORT: String(PEER_PORT), ...env } })
  const [code] = await once(child, 'exit')
  if (code !== 0) { failed++; console.error(`--- ${file} FAILED ---`) } else console.log(`--- ${file} passed ---`)
}
server.kill('SIGTERM')
peer.close?.()
console.log(failed ? `\n${failed} suite(s) FAILED` : '\nAll browser suites passed ✔')
process.exit(failed ? 1 : 0)
