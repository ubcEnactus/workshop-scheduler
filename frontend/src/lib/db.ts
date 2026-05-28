import { PrismaClient } from '@prisma/client'

// Standard Prisma singleton pattern (see https://pris.ly/d/help/next-js-best-practices).
// In dev, Next's hot reload would otherwise spawn a new client on every reload
// and exhaust the connection pool. In prod, the module is loaded once.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
