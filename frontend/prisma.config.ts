import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// Try .env.local first (matches Next.js + our npm scripts), then fall back to .env.
// We intentionally don't use the strict `env()` helper from prisma/config: it
// throws at config-load time, which breaks `prisma generate` when run before
// `.env.local` exists (e.g. on a fresh clone or in `postinstall`).
if (!process.env.DATABASE_URL) {
  try {
    const dotenv = await import('dotenv')
    dotenv.config({ path: '.env.local' })
  } catch {
    // ignore — DATABASE_URL just won't be set, which is fine for `prisma generate`
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Prefer the direct (non-pooled) URL for CLI migrations.
    // pgbouncer's transaction-pool mode doesn't reliably support all DDL or
    // prepared statements that Prisma Migrate uses.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
})
