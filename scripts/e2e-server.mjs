import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'

if (!process.env.E2E_SERVER_LOG || !process.env.TEST_DATABASE_URL)
  throw new Error('Use npm run test:e2e.')
const log = createWriteStream(process.env.E2E_SERVER_LOG, { flags: 'w', mode: 0o600 })
const server = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', process.env.E2E_PORT],
  {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: { ...process.env, NODE_ENV: 'development' },
  }
)
server.stdout.pipe(log)
server.stderr.pipe(log)
server.once('error', (error) => {
  console.error(error)
  process.exitCode = 1
})
server.once('exit', (code) => {
  log.end()
  process.exitCode = code ?? 1
})
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.kill(signal))
