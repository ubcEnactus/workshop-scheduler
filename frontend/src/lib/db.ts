import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '@/generated/prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.')
  }

  const adapter = new PrismaPg({ connectionString })

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

// Lazy proxy — defers PrismaClient construction (and the DATABASE_URL check)
// until the first property access. This lets the module be imported during
// `next build` collection phase without throwing.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = globalForPrisma.prisma ?? createPrismaClient()
    if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = client
    const value = Reflect.get(client, prop, receiver)
    return typeof value === 'function' ? value.bind(client) : value
  },
})
