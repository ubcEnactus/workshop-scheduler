import assert from 'node:assert/strict'
import { prisma } from '../src/lib/db'
import { assertTestDatabase } from './fixtures'
async function main() {
  assertTestDatabase()
  assert.equal(await prisma.workshop.count(), 2)
  assert.equal(await prisma.assignment.count(), 1)
  const tables = await prisma.$queryRaw<
    { name: string | null }[]
  >`SELECT to_regclass('public."Cycle"')::text AS name`
  assert.equal(tables[0].name, null)
}
main().finally(() => prisma.$disconnect())
