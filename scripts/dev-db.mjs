import { readFile, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { startDatabase } from './local-postgres.mjs'

const { pg, url } = await startDatabase('dev')
try {
  const existing = await readFile('.env.local', 'utf8').catch((error) => {
    if (error.code !== 'ENOENT') throw error
    return null
  })
  if (existing === null) {
    await writeFile(
      '.env.local',
      [
        '# Isolated local development database created by npm run db:local.',
        `DATABASE_URL="${url}"`,
        `DIRECT_URL="${url}"`,
        `AUTH_SECRET="${randomBytes(32).toString('hex')}"`,
        'AUTH_RESEND_KEY=""',
        'AUTH_RESEND_FROM=""',
        '',
      ].join('\n'),
      { flag: 'wx', mode: 0o600 }
    )
  } else if (!existing.includes(`DATABASE_URL="${url}"`)) {
    throw new Error(
      'Existing .env.local uses another database. Preserve it; use a separate checkout for db:local.'
    )
  }
  console.log(
    'Isolated PostgreSQL is ready; .env.local points to it. Keep this terminal running. Ctrl+C stops it.'
  )
  await new Promise((resolve) => {
    process.once('SIGINT', resolve)
    process.once('SIGTERM', resolve)
  })
} finally {
  await pg.stop()
}
