import { afterAll, beforeEach, expect, it } from 'vitest'

import { prisma } from '../../src/lib/db'
import { loadSchedule } from '../../src/lib/scheduling/store'
import { vancouverToUtc } from '../../src/lib/time'
import { createSessionFixture, resetFixtures } from '../fixtures'

let fixtures: Awaited<ReturnType<typeof resetFixtures>>

beforeEach(async () => {
  fixtures = await resetFixtures()
})

afterAll(() => prisma.$disconnect())

it('keeps each scoped target once while adding nearby sessions and cancelled target history', async () => {
  const target = await createSessionFixture({
    data: {
      classSectionId: fixtures.cls.id,
      scheduledStart: vancouverToUtc('2027-01-04', 600),
      scheduledEnd: vancouverToUtc('2027-01-04', 660),
    },
  })
  const cancelledTarget = await createSessionFixture({
    data: {
      classSectionId: fixtures.sibling.id,
      scheduledStart: vancouverToUtc('2027-01-05', 600),
      scheduledEnd: vancouverToUtc('2027-01-05', 660),
      status: 'CANCELLED',
    },
  })
  const nearby = await createSessionFixture({
    data: {
      classSectionId: fixtures.sibling.id,
      scheduledStart: vancouverToUtc('2027-01-06', 600),
      scheduledEnd: vancouverToUtc('2027-01-06', 660),
    },
  })
  const outsideNeighborhood = await createSessionFixture({
    data: {
      classSectionId: fixtures.cls.id,
      scheduledStart: vancouverToUtc('2027-03-01', 600),
      scheduledEnd: vancouverToUtc('2027-03-01', 660),
    },
  })

  const snapshot = await loadSchedule(prisma, {
    kind: 'sessions',
    workshopSessionIds: [target.id, cancelledTarget.id],
  })
  const ids = snapshot.workshops.map((workshop) => workshop.id)

  expect(ids).toEqual([cancelledTarget.id, nearby.id, target.id].sort())
  expect(new Set(ids).size).toBe(ids.length)
  expect(ids).not.toContain(outsideNeighborhood.id)
})
