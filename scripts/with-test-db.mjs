import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { freePort, runNode, startDatabase } from './local-postgres.mjs'

const kind = process.argv[2]
if (!['integration', 'e2e'].includes(kind)) throw new Error('Choose integration or e2e.')
// Always create our own cluster. Never reset a DATABASE_URL supplied by the caller.
const { pg, url, root } = await startDatabase('test')
const port = await freePort()
Object.assign(process.env, {
  DATABASE_URL: url,
  DIRECT_URL: url,
  TEST_DATABASE_URL: url,
  AUTH_SECRET: randomBytes(32).toString('hex'),
  AUTH_TRUST_HOST: 'true',
  AUTH_URL: `http://localhost:${port}`,
  E2E_PORT: String(port),
  AUTH_RESEND_KEY: '',
  AUTH_RESEND_FROM: '',
  E2E_SERVER_LOG: path.join(root, 'server.log'),
  PLAYWRIGHT_BROWSERS_PATH: path.resolve('work/browsers'),
})
try {
  await runNode('node_modules/prisma/build/index.js', ['migrate', 'deploy'])
  // The real seed must work from scratch and be repeatable.
  await runNode('node_modules/tsx/dist/cli.mjs', ['prisma/seed.ts'])
  await runNode('node_modules/tsx/dist/cli.mjs', ['prisma/seed.ts'])
  if (kind === 'integration') {
    await runNode('node_modules/tsx/dist/cli.mjs', ['tests/verify-seed.ts'])
    await runNode('node_modules/vitest/vitest.mjs', [
      'run',
      '--config',
      'vitest.integration.config.mts',
    ])
  } else {
    await runNode('node_modules/@playwright/test/cli.js', ['test', ...process.argv.slice(3)])
  }
} finally {
  await pg.stop()
}
