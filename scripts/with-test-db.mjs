import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { freePort, runNode, startDatabase } from './local-postgres.mjs'

const kind = process.argv[2]
if (!['integration', 'e2e', 'e2e-preview'].includes(kind))
  throw new Error('Choose integration, e2e, or e2e-preview.')
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
// Test runners may execute inside a Vercel preview build. Keep the normal
// integration and magic-link suites outside preview-demo mode regardless of
// inherited deployment variables; the dedicated mode below opts in explicitly.
delete process.env.SEED_PREVIEW_DEMO_ACCOUNTS
delete process.env.NEXT_DEPLOYMENT_ID
delete process.env.VERCEL_DEPLOYMENT_ID
if (kind !== 'e2e-preview') {
  delete process.env.E2E_PREVIEW_DEMO
  delete process.env.VERCEL_ENV
  delete process.env.AUTH_PREVIEW_DEMO_ENABLED
}
if (kind === 'e2e-preview') {
  Object.assign(process.env, {
    E2E_PREVIEW_DEMO: 'true',
    VERCEL_ENV: 'preview',
    VERCEL_PROJECT_ID: 'prj_preview_e2e',
    AUTH_PREVIEW_DEMO_ENABLED: 'true',
    AUTH_PREVIEW_DEMO_PROJECT_ID: 'prj_preview_e2e',
    AUTH_PREVIEW_ADMIN_EMAIL: 'preview-admin@example.test',
    AUTH_PREVIEW_TEACHER_EMAIL: 'preview-teacher@example.test',
    AUTH_PREVIEW_PA_EMAIL: 'preview-pa@example.test',
  })
}
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
  } else if (kind === 'e2e-preview') {
    await runNode('node_modules/@playwright/test/cli.js', [
      'test',
      'tests/e2e/preview-demo-auth.spec.ts',
      ...process.argv.slice(3),
    ])
  } else {
    await runNode('node_modules/@playwright/test/cli.js', ['test', ...process.argv.slice(3)])
  }
} finally {
  await pg.stop()
}
