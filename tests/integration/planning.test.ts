import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, expect, it, vi } from 'vitest'

import { prisma } from '../../src/lib/db'
import { scheduleHash } from '../../src/lib/scheduling/matching-preview'
import { loadSchedule } from '../../src/lib/scheduling/store'
import { vancouverToUtc } from '../../src/lib/time'
import {
  createWorkshopBatch,
  createWorkshopBatchForm,
  previewWorkshopBatchForm,
} from '../../src/app/admin/workshops/plan/actions'
import { createSessionFixture, form, resetFixtures } from '../fixtures'

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

let f: Awaited<ReturnType<typeof resetFixtures>>

beforeEach(async () => {
  f = await resetFixtures()
  sessionAuth.mockResolvedValue({ user: { id: f.admin.id } })
  redirectMock.mockClear()
  revalidatePathMock.mockClear()
  await prisma.workshopDefinition.update({
    where: { id: 'fixture-definition-1' },
    data: {
      deliveryStartsOn: new Date('2027-01-04T00:00:00.000Z'),
      deliveryEndsOn: new Date('2027-01-29T00:00:00.000Z'),
      durationMinutes: 60,
      defaultMinPAs: 1,
      defaultMaxPAs: 2,
    },
  })
})

afterAll(() => prisma.$disconnect())

async function enroll(classSectionId = f.cls.id) {
  return prisma.classWorkshop.create({
    data: { classSectionId, workshopDefinitionId: 'fixture-definition-1' },
  })
}

function batch(
  selections: { classWorkshopId: string; date: string; startTime?: string }[],
  key: string = randomUUID(),
  overrides: Record<string, string | number> = {}
) {
  const data = form({
    requestKey: key,
    workshopDefinitionId: 'fixture-definition-1',
    expectedDefinitionRevision: 0,
    mode: 'IN_PERSON',
    location: 'Room 204',
    notes: 'Bring demo supplies',
    participantInstructions: 'Meet at the office',
    ...overrides,
  })
  for (const selection of selections) {
    data.append('classWorkshopId', selection.classWorkshopId)
    data.append('date', selection.date)
    data.append('startTime', selection.startTime ?? '10:00')
  }
  return data
}

async function addFullAvailability() {
  const effectiveFrom = new Date('2000-01-01T00:00:00.000Z')
  await prisma.availabilityScheduleVersion.create({ data: { userId: f.pa.id, effectiveFrom } })
  await prisma.availability.createMany({
    data: [0, 1].flatMap((dayOfWeek) =>
      [600, 615, 630, 645].map((startMin) => ({
        userId: f.pa.id,
        dayOfWeek,
        startMin,
        effectiveFrom,
      }))
    ),
  })
}

it('authorizes run batch creation before parsing', async () => {
  sessionAuth.mockResolvedValue({ user: { id: f.teacher.id } })
  await expect(createWorkshopBatch(new FormData())).rejects.toThrow('REDIRECT:/403')
  await expect(createWorkshopBatchForm({}, new FormData())).rejects.toThrow('REDIRECT:/403')
  expect(await prisma.workshopBatch.count()).toBe(0)
  expect(await prisma.workshopSession.count()).toBe(0)
})

it('creates a selected run draft once under concurrent retries and preserves batch details', async () => {
  const classWorkshop = await enroll()
  const request = batch([{ classWorkshopId: classWorkshop.id, date: '2027-01-04' }])
  const results = await Promise.allSettled([
    createWorkshopBatch(request),
    createWorkshopBatch(request),
  ])
  for (const result of results)
    expect(result.status === 'rejected' && result.reason.message).toMatch(/batch=/)
  expect(await prisma.workshopSession.count()).toBe(1)
  expect(await prisma.workshopBatch.count()).toBe(1)
  const session = await prisma.workshopSession.findFirstOrThrow()
  expect(session.scheduledEnd.getTime() - session.scheduledStart.getTime()).toBe(60 * 60 * 1000)
  expect(session).toMatchObject({
    mode: 'IN_PERSON',
    location: 'Room 204',
    notes: 'Bring demo supplies',
    participantInstructions: 'Meet at the office',
  })
  expect(
    await prisma.classWorkshop.findUniqueOrThrow({ where: { id: classWorkshop.id } })
  ).toMatchObject({ status: 'SCHEDULED', revision: 1 })
})

it('returns one typed destination for concurrent retries and rejects a changed payload', async () => {
  const classWorkshop = await enroll()
  const requestKey = randomUUID()
  const selection = [{ classWorkshopId: classWorkshop.id, date: '2027-01-04' }]

  const [first, retry] = await Promise.all([
    createWorkshopBatchForm({}, batch(selection, requestKey)),
    createWorkshopBatchForm({}, batch(selection, requestKey)),
  ])
  expect(first).toMatchObject({ destination: expect.stringContaining('batch=') })
  const savedBatch = await prisma.workshopBatch.findFirstOrThrow({
    where: { requestKey },
  })
  const destination =
    `/admin/workshop-definitions/fixture-definition-1?step=staff&created=1` +
    `&batch=${savedBatch.id}`
  expect(first).toEqual({ destination })
  expect(retry).toEqual({ destination })

  expect(
    await createWorkshopBatchForm(
      {},
      batch([{ classWorkshopId: classWorkshop.id, date: '2027-01-11' }], requestKey)
    )
  ).toEqual({
    error:
      'This request key was already used for different workshop choices. Reload and review your date choices.',
  })

  expect(await prisma.workshopSession.count()).toBe(1)
  expect(await prisma.workshopBatch.count()).toBe(1)
  expect(redirectMock).not.toHaveBeenCalled()
  expect(revalidatePathMock).not.toHaveBeenCalled()
})

it('saves selected sessions that intentionally overlap for one effective teacher', async () => {
  const one = await enroll(f.cls.id)
  const two = await enroll(f.sibling.id)
  const state = await createWorkshopBatchForm(
    {},
    batch([
      { classWorkshopId: one.id, date: '2027-01-04' },
      { classWorkshopId: two.id, date: '2027-01-04' },
    ])
  )
  expect(state).toMatchObject({ destination: expect.stringContaining('batch=') })
  expect(await prisma.workshopSession.count()).toBe(2)
  expect(await prisma.workshopBatch.count()).toBe(1)
})

it('saves private dates without a staffing check and preserves Plan return context', async () => {
  const classWorkshop = await enroll()
  const saved = await createWorkshopBatchForm(
    {},
    batch([{ classWorkshopId: classWorkshop.id, date: '2027-01-04' }], randomUUID(), {
      destination: 'plan',
      returnWeek: '2027-01-04',
      returnClassSectionId: f.cls.id,
    })
  )
  expect(saved.destination).toBe(
    `/admin/workshop-definitions/fixture-definition-1?step=plan&created=1&week=2027-01-04&classSectionId=${f.cls.id}`
  )
  expect(await prisma.workshopSession.findFirstOrThrow()).toMatchObject({
    status: 'DRAFT',
    locked: false,
    publishedAt: null,
  })
  expect(await prisma.assignment.count()).toBe(0)
  expect(await prisma.matchingPreview.count()).toBe(0)
})

it('still revalidates hosting after an advisory staffing check', async () => {
  await addFullAvailability()
  const classWorkshop = await enroll()
  const input = batch([{ classWorkshopId: classWorkshop.id, date: '2027-01-04' }])
  const preview = await previewWorkshopBatchForm({}, input)
  expect(preview.status).toBe('READY')
  await prisma.classMeeting.updateMany({
    where: { classSectionId: f.cls.id },
    data: { activeForScheduling: false },
  })
  input.set('expectedScheduleHash', preview.scheduleHash!)
  expect((await createWorkshopBatchForm({}, input)).error).toContain('availability')
  expect(await prisma.workshopSession.count()).toBe(0)
  expect(await prisma.workshopBatch.count()).toBe(0)
})

it('rejects a stale run revision and duplicate selections for one enrolled class', async () => {
  const classWorkshop = await enroll()
  expect(
    (
      await createWorkshopBatchForm(
        {},
        batch([{ classWorkshopId: classWorkshop.id, date: '2027-01-04' }], randomUUID(), {
          expectedDefinitionRevision: 9,
        })
      )
    ).error
  ).toContain('workshop run changed')
  expect(
    (
      await createWorkshopBatchForm(
        {},
        batch([
          { classWorkshopId: classWorkshop.id, date: '2027-01-04' },
          { classWorkshopId: classWorkshop.id, date: '2027-01-11' },
        ])
      )
    ).error
  ).toContain('one candidate')
  expect(await prisma.workshopSession.count()).toBe(0)
})

it('keeps staffing diagnostics advisory when availability changes before saving dates', async () => {
  await addFullAvailability()
  const classWorkshop = await enroll()
  const input = batch([{ classWorkshopId: classWorkshop.id, date: '2027-01-04' }])
  const preview = await previewWorkshopBatchForm({}, input)
  expect(preview).toMatchObject({ status: 'READY' })
  expect(preview.scheduleHash).toHaveLength(64)
  expect(await prisma.assignment.count()).toBe(0)

  await prisma.availability.deleteMany({ where: { userId: f.pa.id } })
  input.set('expectedScheduleHash', preview.scheduleHash!)
  const saved = await createWorkshopBatchForm({}, input)
  expect(saved.error).toBeUndefined()
  expect(saved.destination).toContain('?step=staff&created=1')
  expect(await prisma.workshopSession.count()).toBe(1)
  expect(await prisma.assignment.count()).toBe(0)
  expect(await prisma.matchingPreview.count()).toBe(0)
})

it('previews a realistic nine-class shortage without writing scheduling state', async () => {
  const selections: { classWorkshopId: string; date: string }[] = []
  for (let index = 0; index < 9; index += 1) {
    const teacher = await prisma.user.create({
      data: {
        email: `preview-teacher-${index}@fixture.local`,
        name: `Preview Teacher ${index + 1}`,
        role: 'TEACHER',
        schoolId: f.school.id,
      },
    })
    const cls = await prisma.classSection.create({
      data: {
        name: `Preview Class ${index + 1}`,
        teacherId: teacher.id,
        schoolId: f.school.id,
        meetings: {
          create: {
            dayOfWeek: 0,
            startMinute: 540,
            endMinute: 720,
            activeForScheduling: true,
          },
        },
      },
    })
    const enrollment = await enroll(cls.id)
    selections.push({ classWorkshopId: enrollment.id, date: '2027-01-04' })
  }
  const enrollmentState = await prisma.classWorkshop.findMany({
    where: { id: { in: selections.map((selection) => selection.classWorkshopId) } },
    select: { id: true, status: true, revision: true, updatedAt: true },
    orderBy: { id: 'asc' },
  })
  const settingsRevision = (await prisma.schedulingSettings.findUniqueOrThrow({ where: { id: 1 } }))
    .revision

  const preview = await previewWorkshopBatchForm({}, batch(selections))

  expect(preview).toMatchObject({ status: 'NO_VALID_PLAN' })
  expect(preview.scheduleHash).toHaveLength(64)
  expect(preview.rows).toHaveLength(9)
  expect(preview.rows?.every((row) => row.assigned === 0 && row.required === 1)).toBe(true)
  expect(await prisma.workshopSession.count()).toBe(0)
  expect(await prisma.assignment.count()).toBe(0)
  expect(await prisma.workshopBatch.count()).toBe(0)
  expect(await prisma.matchingPreview.count()).toBe(0)
  expect((await prisma.schedulingSettings.findUniqueOrThrow({ where: { id: 1 } })).revision).toBe(
    settingsRevision
  )
  expect(
    await prisma.classWorkshop.findMany({
      where: { id: { in: selections.map((selection) => selection.classWorkshopId) } },
      select: { id: true, status: true, revision: true, updatedAt: true },
      orderBy: { id: 'asc' },
    })
  ).toEqual(enrollmentState)
})

it('uses the same scoped schedule hash as the staffing preview', async () => {
  await addFullAvailability()
  const classWorkshop = await enroll()
  const preview = await previewWorkshopBatchForm(
    {},
    batch([{ classWorkshopId: classWorkshop.id, date: '2027-01-04' }])
  )
  const snapshot = await loadSchedule(prisma, {
    kind: 'run',
    workshopDefinitionId: 'fixture-definition-1',
  })
  expect(preview.scheduleHash).toBe(scheduleHash(snapshot))
})

it('loads cross-run commitments for a run with no existing sessions', async () => {
  await addFullAvailability()
  const host = await prisma.classSection.create({
    data: {
      name: 'Other host',
      teacherId: f.otherTeacher.id,
      schoolId: f.otherSchool.id,
    },
  })
  const commitment = await createSessionFixture({
    data: {
      classSectionId: host.id,
      scheduledStart: vancouverToUtc('2027-01-04', 600),
      scheduledEnd: vancouverToUtc('2027-01-04', 660),
    },
  })
  await prisma.assignment.create({
    data: { workshopSessionId: commitment.id, paId: f.pa.id, source: 'MANUAL' },
  })
  const classWorkshop = await enroll()
  const preview = await previewWorkshopBatchForm(
    {},
    batch([{ classWorkshopId: classWorkshop.id, date: '2027-01-05' }])
  )
  expect(preview.status).toBe('REVIEW_REQUIRED')
  expect(preview.rows).toMatchObject([{ assigned: 0, required: 1 }])
  expect(preview.manualPlan).toMatchObject({
    kind: 'WEEKLY',
  })
  expect(preview.rows?.[0]).toMatchObject({
    classWorkshopId: classWorkshop.id,
    staffing: [{ paId: f.pa.id, warningCodes: ['SAME_WEEK'] }],
  })
  expect(preview.rows?.[0].reasons.join(' ')).not.toContain('override option')
})
