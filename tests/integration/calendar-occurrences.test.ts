import { afterAll, beforeEach, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '../../src/lib/db'
import { resetFixtures, form, createSessionFixture } from '../fixtures'
import { vancouverToUtc } from '../../src/lib/time'
import { generateCandidatesFromClassContext } from '../../src/lib/scheduling/recurring-candidates'
const { sessionAuth } = vi.hoisted(() => ({ sessionAuth: vi.fn() }))
vi.mock('next-auth', () => ({ default: () => ({ auth: sessionAuth }) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error('REDIRECT:' + url)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
import {
  changeClassOccurrence,
  removeClassAvailabilityException,
  removeSchoolClosure,
} from '../../src/app/admin/classes/availability-actions'
import { createWorkshopBatchForm } from '../../src/app/admin/workshops/plan/actions'

let f: Awaited<ReturnType<typeof resetFixtures>>
beforeEach(async () => {
  f = await resetFixtures()
  sessionAuth.mockResolvedValue({ user: { id: f.admin.id } })
})
afterAll(() => prisma.$disconnect())
const day = '2027-01-04'
function input(overrides: Record<string, string> = {}) {
  const meeting = f.cls.meetings.find((item) => item.dayOfWeek === 0)!
  return form({
    classSectionId: f.cls.id,
    id: meeting.id,
    date: day,
    expectedUpdatedAt: meeting.updatedAt.toISOString(),
    ...overrides,
  })
}
async function candidates(start = day, end = day) {
  const cls = await prisma.classSection.findUniqueOrThrow({
    where: { id: f.cls.id },
    include: {
      meetings: { include: { skips: true } },
      availabilitySlots: true,
      availabilityExceptions: true,
      school: { include: { closures: true } },
    },
  })
  return generateCandidatesFromClassContext({
    windowStart: start,
    windowEnd: end,
    durationMinutes: 60,
    meetings: cls.meetings,
    exceptions: cls.availabilityExceptions,
    schoolClosures: cls.school.closures,
    explicit: cls.availabilitySlots,
  })
}

it('removes one date, preserves the pattern and dated replacements, and safely handles retries and late Undo', async () => {
  const removed = await changeClassOccurrence({}, input())
  expect(removed).toMatchObject({ saved: true, removed: true })
  expect(await candidates()).toEqual([])
  expect((await candidates('2027-01-11', '2027-01-11')).length).toBeGreaterThan(0)
  expect(await changeClassOccurrence({}, input())).toEqual(removed)
  const restoreInput = input({ expectedUpdatedAt: removed.updatedAt!, skipId: removed.skipId! })
  const restored = await changeClassOccurrence({}, restoreInput)
  expect(restored).toMatchObject({ saved: true, removed: false })
  expect((await candidates()).length).toBeGreaterThan(0)
  expect(await changeClassOccurrence({}, input())).toHaveProperty('error')
  const again = await changeClassOccurrence({}, input({ expectedUpdatedAt: restored.updatedAt! }))
  expect(again.skipId).not.toBe(removed.skipId)
  expect(await changeClassOccurrence({}, restoreInput)).toHaveProperty('error')
  expect(await prisma.classMeetingSkip.count()).toBe(1)
  await prisma.availabilitySlot.create({
    data: {
      classSectionId: f.cls.id,
      start: vancouverToUtc(day, 600),
      end: vancouverToUtc(day, 660),
    },
  })
  expect((await candidates()).map((item) => item.authorization.kind)).toEqual(['EXPLICIT'])
})

it('rejects wrong roles, teacher ownership, invalid dates and stale weekly revisions', async () => {
  for (const user of [f.teacher, f.pa]) {
    sessionAuth.mockResolvedValue({ user: { id: user.id } })
    await expect(changeClassOccurrence({}, new FormData())).rejects.toThrow('/403')
  }
  sessionAuth.mockResolvedValue({ user: { id: f.admin.id } })
  const invalidInputs: Record<string, string>[] = [
    { classSectionId: f.sibling.id },
    { date: '2027-01-05' },
    { date: '2027-02-30' },
    { expectedUpdatedAt: new Date(0).toISOString() },
  ]
  for (const overrides of invalidInputs)
    expect(await changeClassOccurrence({}, input(overrides))).toHaveProperty('error')
  expect(await prisma.classMeetingSkip.count()).toBe(0)
})

it.each(['teacher', 'school', 'profile', 'inactive', 'range'] as const)(
  'rejects unavailable %s records',
  async (kind) => {
    const meeting = f.cls.meetings.find((item) => item.dayOfWeek === 0)!
    if (kind === 'teacher')
      await prisma.user.update({ where: { id: f.teacher.id }, data: { deletedAt: new Date() } })
    if (kind === 'school')
      await prisma.school.update({ where: { id: f.school.id }, data: { deletedAt: new Date() } })
    if (kind === 'profile')
      await prisma.classSection.update({
        where: { id: f.cls.id },
        data: { archivedAt: new Date() },
      })
    if (kind === 'inactive' || kind === 'range')
      await prisma.classMeeting.update({
        where: { id: meeting.id },
        data:
          kind === 'inactive'
            ? { activeForScheduling: false }
            : { effectiveUntil: new Date('2026-12-31') },
      })
    const current = await prisma.classMeeting.findUniqueOrThrow({ where: { id: meeting.id } })
    expect(
      await changeClassOccurrence({}, input({ expectedUpdatedAt: current.updatedAt.toISOString() }))
    ).toHaveProperty('error')
  }
)

it.each(['DRAFT', 'PUBLISHED', 'COMPLETED'] as const)(
  'protects overlapping %s sessions without changing assignments or status',
  async (status) => {
    const session = await createSessionFixture({
      data: {
        classSectionId: f.cls.id,
        scheduledStart: vancouverToUtc(day, 690),
        scheduledEnd: vancouverToUtc(day, 750),
        status,
        minPAs: 1,
        maxPAs: 2,
        mode: 'IN_PERSON',
      },
    })
    expect(await changeClassOccurrence({}, input())).toMatchObject({
      sessionId: session.id,
      error: expect.stringContaining('booked session'),
    })
    expect(await prisma.classMeetingSkip.count()).toBe(0)
    expect(
      (await prisma.workshopSession.findUniqueOrThrow({ where: { id: session.id } })).status
    ).toBe(status)
    await prisma.workshopSession.update({
      where: { id: session.id },
      data: { status: 'CANCELLED' },
    })
    expect(await changeClassOccurrence({}, input())).toMatchObject({ saved: true })
  }
)

it('revalidates a stale planner submission after the last authorizing occurrence is removed', async () => {
  const run = await prisma.workshopDefinition.update({
    where: { id: 'fixture-definition-1' },
    data: { deliveryStartsOn: new Date(day), deliveryEndsOn: new Date(day) },
  })
  const enrollment = await prisma.classWorkshop.create({
    data: { classSectionId: f.cls.id, workshopDefinitionId: run.id },
  })
  expect((await candidates()).length).toBeGreaterThan(0)
  expect(await changeClassOccurrence({}, input())).toMatchObject({ saved: true })
  const result = await createWorkshopBatchForm(
    {},
    form({
      requestKey: randomUUID(),
      workshopDefinitionId: run.id,
      expectedDefinitionRevision: String(run.revision),
      classWorkshopId: enrollment.id,
      date: day,
      startTime: '10:00',
      mode: 'IN_PERSON',
    })
  )
  expect(result).toHaveProperty('error')
  expect(await prisma.workshopSession.count()).toBe(0)
})

it('retains skips when hours change, prevents obsolete restoration and cascades pattern deletion', async () => {
  const removed = await changeClassOccurrence({}, input())
  const meeting = f.cls.meetings.find((item) => item.dayOfWeek === 0)!
  const edited = await prisma.classMeeting.update({
    where: { id: meeting.id },
    data: { startMinute: 547 },
  })
  expect(await candidates()).toEqual([])
  const restored = await changeClassOccurrence(
    {},
    input({ expectedUpdatedAt: edited.updatedAt.toISOString(), skipId: removed.skipId! })
  )
  expect(restored).toMatchObject({ saved: true })
  const skipped = await changeClassOccurrence({}, input({ expectedUpdatedAt: restored.updatedAt! }))
  const moved = await prisma.classMeeting.update({
    where: { id: meeting.id },
    data: { dayOfWeek: 2 },
  })
  expect(
    await changeClassOccurrence(
      {},
      input({ expectedUpdatedAt: moved.updatedAt.toISOString(), skipId: skipped.skipId! })
    )
  ).toHaveProperty('error')
  await prisma.classMeeting.delete({ where: { id: meeting.id } })
  expect(await prisma.classMeetingSkip.count()).toBe(0)
})

it('keeps legacy restrictions manageable with stale checks and protects booked additions', async () => {
  const addition = await prisma.classAvailabilityException.create({
    data: {
      classSectionId: f.cls.id,
      date: new Date(day),
      kind: 'ADDITIONAL',
      startMinute: 600,
      endMinute: 660,
    },
  })
  const session = await createSessionFixture({
    data: {
      classSectionId: f.cls.id,
      scheduledStart: vancouverToUtc(day, 600),
      scheduledEnd: vancouverToUtc(day, 660),
      minPAs: 1,
      maxPAs: 2,
      mode: 'IN_PERSON',
    },
  })
  expect(
    await removeClassAvailabilityException(
      {},
      form({
        classSectionId: f.cls.id,
        id: addition.id,
        expectedUpdatedAt: addition.updatedAt.toISOString(),
      })
    )
  ).toMatchObject({ sessionId: session.id })
  const closure = await prisma.schoolClosure.create({
    data: { schoolId: f.school.id, date: new Date(day) },
  })
  expect(await candidates()).toEqual([])
  expect(
    await removeSchoolClosure(
      {},
      form({ schoolId: f.school.id, id: closure.id, expectedUpdatedAt: new Date(0).toISOString() })
    )
  ).toHaveProperty('error')
  expect(
    await removeSchoolClosure(
      {},
      form({
        schoolId: f.school.id,
        id: closure.id,
        expectedUpdatedAt: closure.updatedAt.toISOString(),
      })
    )
  ).toEqual({ saved: true })
})
