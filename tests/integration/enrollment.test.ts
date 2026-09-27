import { afterAll, beforeEach, expect, it, vi } from 'vitest'

import { prisma } from '../../src/lib/db'
import { resetFixtures } from '../fixtures'

const { sessionAuth } = vi.hoisted(() => ({ sessionAuth: vi.fn() }))
vi.mock('next-auth', () => ({ default: () => ({ auth: sessionAuth }) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error('REDIRECT:' + url)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { enrollClassesInRuns } from '../../src/app/admin/class-workshops/actions'

let fixture: Awaited<ReturnType<typeof resetFixtures>>

beforeEach(async () => {
  fixture = await resetFixtures()
  sessionAuth.mockResolvedValue({ user: { id: fixture.admin.id } })
})

afterAll(() => prisma.$disconnect())

function enrollmentForm({
  runIds,
  classSectionIds,
  requestKey,
}: {
  runIds?: string[]
  classSectionIds?: string[]
  requestKey?: string
}) {
  const data = new FormData()
  for (const id of runIds ?? []) data.append('runIds', id)
  for (const id of classSectionIds ?? []) data.append('classSectionIds', id)
  if (requestKey !== undefined) data.set('requestKey', requestKey)
  return data
}

async function expectNoEnrollmentWrites() {
  expect(await prisma.classWorkshop.count()).toBe(0)
  expect(await prisma.enrollmentBatch.count()).toBe(0)
  expect((await prisma.schedulingSettings.findUniqueOrThrow({ where: { id: 1 } })).revision).toBe(0)
}

it.each([
  ['no selection', enrollmentForm({ requestKey: 'empty-selection' })],
  [
    'no classes',
    enrollmentForm({ runIds: ['fixture-definition-1'], requestKey: 'missing-classes' }),
  ],
  [
    'no request key',
    enrollmentForm({
      runIds: ['fixture-definition-1'],
      classSectionIds: ['fixture-class-placeholder'],
    }),
  ],
])('validates %s before starting a scheduling write', async (_label, input) => {
  const result = await enrollClassesInRuns(input)
  expect(result.ok).toBe(false)
  await expectNoEnrollmentWrites()
})

it.each(['teacher', 'pa'] as const)('rejects the %s role before parsing', async (role) => {
  sessionAuth.mockResolvedValue({ user: { id: fixture[role].id } })
  await expect(enrollClassesInRuns(new FormData())).rejects.toThrow('/403')
  await expectNoEnrollmentWrites()
})

it('creates the requested class and workshop Cartesian product without sessions', async () => {
  const result = await enrollClassesInRuns(
    enrollmentForm({
      runIds: ['fixture-definition-2', 'fixture-definition-1', 'fixture-definition-1'],
      classSectionIds: [fixture.sibling.id, fixture.cls.id, fixture.cls.id],
      requestKey: 'cartesian-enrollment',
    })
  )

  expect(result).toEqual({ ok: true, created: 4 })
  expect(
    await prisma.classWorkshop.findMany({
      select: { workshopDefinitionId: true, classSectionId: true },
      orderBy: [{ workshopDefinitionId: 'asc' }, { classSectionId: 'asc' }],
    })
  ).toEqual(
    ['fixture-definition-1', 'fixture-definition-2'].flatMap((workshopDefinitionId) =>
      [fixture.cls.id, fixture.sibling.id]
        .sort()
        .map((classSectionId) => ({ workshopDefinitionId, classSectionId }))
    )
  )
  expect(await prisma.workshopSession.count()).toBe(0)
  expect(await prisma.enrollmentBatch.count()).toBe(1)
})

it('replays the same request key and normalized payload without duplicating enrollments', async () => {
  const first = enrollmentForm({
    runIds: ['fixture-definition-1'],
    classSectionIds: [fixture.cls.id, fixture.sibling.id],
    requestKey: 'repeat-enrollment',
  })
  const replay = enrollmentForm({
    runIds: ['fixture-definition-1', 'fixture-definition-1'],
    classSectionIds: [fixture.sibling.id, fixture.cls.id, fixture.cls.id],
    requestKey: 'repeat-enrollment',
  })

  expect(await enrollClassesInRuns(first)).toEqual({ ok: true, created: 2 })
  expect(await enrollClassesInRuns(replay)).toEqual({ ok: true, created: 0 })
  expect(await prisma.classWorkshop.count()).toBe(2)
  expect(await prisma.enrollmentBatch.count()).toBe(1)
  expect(await prisma.workshopSession.count()).toBe(0)
})

it('counts only new pairs under a new key and preserves an existing waived enrollment', async () => {
  const existing = await prisma.classWorkshop.create({
    data: {
      workshopDefinitionId: 'fixture-definition-1',
      classSectionId: fixture.cls.id,
    },
  })
  await prisma.classWorkshop.update({
    where: { id: existing.id },
    data: {
      status: 'WAIVED',
      waivedAt: new Date('2027-01-01T00:00:00.000Z'),
      waivedById: fixture.admin.id,
      waiverReason: 'Already delivered elsewhere',
    },
  })

  const result = await enrollClassesInRuns(
    enrollmentForm({
      runIds: ['fixture-definition-1'],
      classSectionIds: [fixture.cls.id, fixture.sibling.id],
      requestKey: 'new-key-existing-pair',
    })
  )

  expect(result).toEqual({ ok: true, created: 1 })
  expect(await prisma.classWorkshop.count()).toBe(2)
  expect(
    await prisma.classWorkshop.findUniqueOrThrow({ where: { id: existing.id } })
  ).toMatchObject({
    status: 'WAIVED',
    waiverReason: 'Already delivered elsewhere',
    waivedById: fixture.admin.id,
  })
  expect(await prisma.workshopSession.count()).toBe(0)
})

it('rejects a changed payload for the same request key without partially adding its new pair', async () => {
  const requestKey = 'changed-payload-enrollment'
  expect(
    await enrollClassesInRuns(
      enrollmentForm({
        runIds: ['fixture-definition-1'],
        classSectionIds: [fixture.cls.id],
        requestKey,
      })
    )
  ).toEqual({ ok: true, created: 1 })

  const changed = await enrollClassesInRuns(
    enrollmentForm({
      runIds: ['fixture-definition-1'],
      classSectionIds: [fixture.cls.id, fixture.sibling.id],
      requestKey,
    })
  )
  expect(changed).toEqual({
    ok: false,
    error: 'This teacher-selection request key was already used for another selection.',
  })
  expect(await prisma.classWorkshop.count()).toBe(1)
  expect(await prisma.classWorkshop.count({ where: { classSectionId: fixture.sibling.id } })).toBe(
    0
  )
  expect(await prisma.enrollmentBatch.count()).toBe(1)
})

type InvalidEnrollmentCase =
  | 'archived class'
  | 'deleted school'
  | 'deleted teacher'
  | 'teacher at another school'
  | 'missing workshop'

it.each<InvalidEnrollmentCase>([
  'archived class',
  'deleted school',
  'deleted teacher',
  'teacher at another school',
  'missing workshop',
])('rejects an invalid %s atomically', async (scenario) => {
  let runIds = ['fixture-definition-1']
  let classSectionIds = [fixture.cls.id, fixture.sibling.id]
  if (scenario === 'archived class')
    await prisma.classSection.update({
      where: { id: fixture.sibling.id },
      data: { archivedAt: new Date() },
    })
  if (scenario === 'deleted school')
    await prisma.school.update({
      where: { id: fixture.school.id },
      data: { deletedAt: new Date() },
    })
  if (scenario === 'deleted teacher')
    await prisma.user.update({ where: { id: fixture.teacher.id }, data: { deletedAt: new Date() } })
  if (scenario === 'teacher at another school')
    await prisma.user.update({
      where: { id: fixture.teacher.id },
      data: { schoolId: fixture.otherSchool.id },
    })
  if (scenario === 'missing workshop') {
    runIds = ['fixture-definition-1', 'missing-workshop']
    classSectionIds = [fixture.cls.id]
  }

  const result = await enrollClassesInRuns(
    enrollmentForm({
      runIds,
      classSectionIds,
      requestKey: `invalid-${scenario}`,
    })
  )
  expect(result.ok).toBe(false)
  expect(await prisma.classWorkshop.count()).toBe(0)
  expect(await prisma.enrollmentBatch.count()).toBe(0)
  expect(await prisma.workshopSession.count()).toBe(0)
})
