import { afterAll, beforeEach, expect, it, vi } from 'vitest'

import { prisma } from '../../src/lib/db'
import { form, resetFixtures } from '../fixtures'

const { sessionAuth, redirectMock, revalidatePathMock } = vi.hoisted(() => ({
  sessionAuth: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error('REDIRECT:' + url)
  }),
  revalidatePathMock: vi.fn(),
}))
vi.mock('next-auth', () => ({ default: () => ({ auth: sessionAuth }) }))
vi.mock('next/navigation', () => ({ redirect: redirectMock }))
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))

import { createWorkshopDefinition } from '../../src/app/admin/class-workshops/actions'

let fixture: Awaited<ReturnType<typeof resetFixtures>>

beforeEach(async () => {
  fixture = await resetFixtures()
  sessionAuth.mockResolvedValue({ user: { id: fixture.admin.id } })
  redirectMock.mockClear()
  revalidatePathMock.mockClear()
})

afterAll(() => prisma.$disconnect())

const validDefinition = {
  title: 'Community Design Lab · Winter',
  number: '',
  description: 'A custom workshop description.',
  durationMinutes: 75,
  defaultMinPAs: 2,
  defaultMaxPAs: 5,
  deliveryStart: '2027-02-01',
  deliveryEnd: '2027-02-26',
}

it('creates a custom named workshop and returns its ID without enrollment side effects', async () => {
  const result = await createWorkshopDefinition(form(validDefinition))

  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error)
  expect(
    await prisma.workshopDefinition.findUniqueOrThrow({
      where: { id: result.id },
      include: { classWorkshops: true },
    })
  ).toMatchObject({
    id: result.id,
    number: null,
    identityStatus: 'IDENTIFIED',
    revision: 0,
    title: 'Community Design Lab · Winter',
    description: 'A custom workshop description.',
    durationMinutes: 75,
    defaultMinPAs: 2,
    defaultMaxPAs: 5,
    deliveryStartsOn: new Date('2027-02-01T00:00:00.000Z'),
    deliveryEndsOn: new Date('2027-02-26T00:00:00.000Z'),
    classWorkshops: [],
  })
  expect(await prisma.workshopSession.count()).toBe(0)
  expect(await prisma.enrollmentBatch.count()).toBe(0)
  expect(redirectMock).not.toHaveBeenCalled()
  expect(revalidatePathMock).not.toHaveBeenCalled()
})

it.each([
  ['missing title', { ...validDefinition, title: '' }],
  ['missing delivery start', { ...validDefinition, deliveryStart: '' }],
  ['missing delivery end', { ...validDefinition, deliveryEnd: '' }],
  [
    'reversed delivery window',
    { ...validDefinition, deliveryStart: '2027-03-01', deliveryEnd: '2027-02-26' },
  ],
  ['invalid duration', { ...validDefinition, durationMinutes: 0 }],
  ['invalid staffing bounds', { ...validDefinition, defaultMinPAs: 6, defaultMaxPAs: 5 }],
  ['an existing ID', { ...validDefinition, id: 'fixture-definition-1' }],
])('rejects %s atomically', async (_label, values) => {
  const beforeCount = await prisma.workshopDefinition.count()
  const result = await createWorkshopDefinition(form(values))

  expect(result.ok).toBe(false)
  expect(await prisma.workshopDefinition.count()).toBe(beforeCount)
  expect(await prisma.classWorkshop.count()).toBe(0)
  expect(await prisma.workshopSession.count()).toBe(0)
  expect((await prisma.schedulingSettings.findUniqueOrThrow({ where: { id: 1 } })).revision).toBe(0)
  expect(redirectMock).not.toHaveBeenCalled()
  expect(revalidatePathMock).not.toHaveBeenCalled()
})
