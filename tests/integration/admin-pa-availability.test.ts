import { afterAll, beforeEach, expect, it, vi } from 'vitest'
import { prisma } from '../../src/lib/db'
import { resetFixtures, form, createSessionFixture } from '../fixtures'
import { availabilityRevision, replaceAvailability } from '../../src/lib/availability'
import { vancouverDateKey, vancouverToUtc } from '../../src/lib/time'
import { loadSchedule } from '../../src/lib/scheduling/store'
const { sessionAuth } = vi.hoisted(() => ({ sessionAuth: vi.fn() }))
vi.mock('next-auth', () => ({ default: () => ({ auth: sessionAuth }) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error('REDIRECT:' + url)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
import {
  savePAAvailability,
  savePAException,
  removePAException,
} from '../../src/app/admin/pas/availability-actions'
import { saveAvailabilityForm } from '../../src/app/pa/availability/actions'
import { saveRecurringClassAvailability } from '../../src/app/admin/classes/availability-actions'
import { workshopSchema } from '../../src/lib/schemas/workshops'

let f: Awaited<ReturnType<typeof resetFixtures>>
const today = vancouverDateKey(new Date())
beforeEach(async () => {
  f = await resetFixtures()
  sessionAuth.mockResolvedValue({ user: { id: f.admin.id } })
})
afterAll(() => prisma.$disconnect())
const revision = (id = f.pa.id) => availabilityRevision(prisma, id)

it('allows only admins to edit an active PA and validates dates and slots', async () => {
  for (const user of [f.pa, f.teacher]) {
    sessionAuth.mockResolvedValue({ user: { id: user.id } })
    for (const action of [savePAAvailability, savePAException, removePAException])
      await expect(action(f.pa.id, '', {}, new FormData())).rejects.toThrow('/403')
  }
  sessionAuth.mockResolvedValue({ user: { id: f.admin.id } })
  for (const id of [f.teacher.id, f.deleted.id, 'missing'])
    expect(
      await savePAAvailability(
        id,
        await revision(id),
        {},
        form({ effectiveFrom: today, slots: '0-600' })
      )
    ).toHaveProperty('error')
  for (const data of [
    { effectiveFrom: today, slots: '5-600' },
    { effectiveFrom: today, slots: '0-607' },
  ])
    expect(await savePAAvailability(f.pa.id, await revision(), {}, form(data))).toHaveProperty(
      'error'
    )
  expect(await prisma.availability.count()).toBe(0)
})

it('shares effective schedules with the PA and rejects stale saves from either actor', async () => {
  const before = await revision()
  const input = form({ effectiveFrom: today, slots: '0-600' })
  await expect(savePAAvailability(f.pa.id, before, {}, input)).rejects.toThrow(
    `/admin/pas/${f.pa.id}/availability?saved=1`
  )
  const current = await revision()
  expect(current).not.toBe(before)
  expect(
    await savePAAvailability(f.pa.id, before, {}, form({ effectiveFrom: today }))
  ).toMatchObject({ error: expect.stringContaining('changed') })
  sessionAuth.mockResolvedValue({ user: { id: f.pa.id } })
  expect(
    await saveAvailabilityForm({}, form({ effectiveFrom: today, expectedRevision: before }))
  ).toMatchObject({ error: expect.stringContaining('changed') })
  await expect(
    saveAvailabilityForm(
      {},
      form({ effectiveFrom: today, expectedRevision: current, slots: '1-600' })
    )
  ).rejects.toThrow('/pa/availability?saved=1')
  sessionAuth.mockResolvedValue({ user: { id: f.admin.id } })
  expect(await savePAAvailability(f.pa.id, current, {}, input)).toHaveProperty('error')
  const rows = await prisma.availability.findMany({ where: { userId: f.pa.id } })
  expect(rows).toHaveLength(1)
  expect(rows[0].dayOfWeek).toBe(1)
})

it('preserves earlier versions and published assignments when an admin clears availability', async () => {
  await replaceAvailability(f.pa.id, [{ dayOfWeek: 0, startMin: 600 }], '2026-01-01')
  await replaceAvailability(f.pa.id, [{ dayOfWeek: 1, startMin: 600 }], '2099-01-01')
  const session = await createSessionFixture({
    data: {
      classSectionId: f.cls.id,
      scheduledStart: vancouverToUtc('2027-01-04', 600),
      scheduledEnd: vancouverToUtc('2027-01-04', 660),
      status: 'PUBLISHED',
      mode: 'IN_PERSON',
      minPAs: 1,
      maxPAs: 2,
    },
  })
  const assignment = await prisma.assignment.create({
    data: { workshopSessionId: session.id, paId: f.pa.id },
  })
  await expect(
    savePAAvailability(f.pa.id, await revision(), {}, form({ effectiveFrom: '2027-01-01' }))
  ).rejects.toThrow('saved=1')
  expect(await prisma.availability.count({ where: { userId: f.pa.id } })).toBe(1)
  expect(await prisma.availabilityScheduleVersion.count({ where: { userId: f.pa.id } })).toBe(2)
  const versions = await prisma.availabilityScheduleVersion.findMany({
    where: { userId: f.pa.id },
    orderBy: { effectiveFrom: 'asc' },
  })
  expect(versions[1]).toMatchObject({ effectiveFrom: new Date(today), effectiveUntil: null })
  expect(versions[0].effectiveUntil).toEqual(new Date(new Date(today).getTime() - 86400000))
  expect(await prisma.assignment.findUnique({ where: { id: assignment.id } })).toEqual(assignment)
  expect(await prisma.workshopSession.findUnique({ where: { id: session.id } })).toEqual(session)
  const snapshot = await loadSchedule(prisma)
  expect(snapshot.workshops.find((item) => item.id === session.id)?.status).toBe('PUBLISHED')
})

it('PA saves a single current schedule regardless of posted dates and preserves dated additions', async () => {
  await replaceAvailability(f.pa.id, [{ dayOfWeek: 0, startMin: 600 }], '2026-01-01')
  await replaceAvailability(f.pa.id, [{ dayOfWeek: 1, startMin: 600 }], '2099-01-01')
  const addition = await prisma.pAAvailabilityException.create({
    data: {
      userId: f.pa.id,
      date: new Date('2027-01-06'),
      kind: 'AVAILABLE',
      startMinute: 600,
      endMinute: 660,
    },
  })
  sessionAuth.mockResolvedValue({ user: { id: f.pa.id } })
  await expect(
    saveAvailabilityForm(
      {},
      form({
        effectiveFrom: '2099-01-01',
        expectedRevision: await revision(),
        slots: '2-600',
      })
    )
  ).rejects.toThrow('saved=1')
  const rows = await prisma.availability.findMany({
    where: { userId: f.pa.id },
    orderBy: { effectiveFrom: 'asc' },
  })
  expect(rows).toHaveLength(2)
  expect(rows[1]).toMatchObject({
    dayOfWeek: 2,
    startMin: 600,
    effectiveFrom: new Date(today),
    effectiveUntil: null,
  })
  expect(rows[0].effectiveUntil).toEqual(new Date(new Date(today).getTime() - 86400000))
  expect(
    await prisma.availabilityScheduleVersion.count({
      where: { userId: f.pa.id, effectiveFrom: { gt: new Date(today) } },
    })
  ).toBe(0)
  expect(await prisma.pAAvailabilityException.findUnique({ where: { id: addition.id } })).toEqual(
    addition
  )
})

it('scopes dated edits to the selected PA and guards stale exception changes', async () => {
  const before = await revision()
  expect(
    await savePAException(f.pa.id, before, {}, form({ date: today, kind: 'UNAVAILABLE' }))
  ).toEqual({ saved: true })
  const exception = await prisma.pAAvailabilityException.findFirstOrThrow({
    where: { userId: f.pa.id },
  })
  expect(await removePAException(f.pa.id, before, {}, form({ id: exception.id }))).toHaveProperty(
    'error'
  )
  const other = await prisma.user.create({ data: { role: 'PA', email: 'other-pa@fixture.local' } })
  expect(
    await removePAException(other.id, await revision(other.id), {}, form({ id: exception.id }))
  ).toHaveProperty('error')
  expect(
    await removePAException(f.pa.id, await revision(), {}, form({ id: exception.id }))
  ).toEqual({})
  expect(await prisma.pAAvailabilityException.count()).toBe(0)
})

it('creates exactly the selected weekdays, always active, and rejects an empty selection', async () => {
  const input = form({
    classSectionId: f.sibling.id,
    startTime: '09:00',
    endTime: '10:00',
    effectiveFrom: today,
    activeForScheduling: '0',
  })
  expect(await saveRecurringClassAvailability({}, input)).toHaveProperty('error')
  for (const day of [1, 3, 3]) input.append('days', String(day))
  expect(await saveRecurringClassAvailability({}, input)).toEqual({ saved: true })
  const rows = await prisma.classMeeting.findMany({
    where: { classSectionId: f.sibling.id, dayOfWeek: { in: [1, 3] } },
    orderBy: { dayOfWeek: 'asc' },
  })
  expect(rows.map((row) => row.dayOfWeek)).toEqual([1, 3])
  expect(rows.every((row) => row.activeForScheduling)).toBe(true)
})

it('activates a reviewed legacy weekly time while retaining its identity and removed dates', async () => {
  const row = await prisma.classMeeting.update({
    where: { id: f.cls.meetings[0].id },
    data: { activeForScheduling: false },
  })
  const skip = await prisma.classMeetingSkip.create({
    data: { classMeetingId: row.id, date: new Date('2027-01-04'), sourceUpdatedAt: row.updatedAt },
  })
  expect(
    await saveRecurringClassAvailability(
      {},
      form({
        id: row.id,
        classSectionId: f.cls.id,
        expectedUpdatedAt: row.updatedAt.toISOString(),
        days: '0',
        startTime: '09:00',
        endTime: '12:00',
        effectiveFrom: '2027-01-01',
      })
    )
  ).toEqual({ saved: true })
  expect(await prisma.classMeeting.findUnique({ where: { id: row.id } })).toMatchObject({
    activeForScheduling: true,
  })
  expect(await prisma.classMeetingSkip.findUnique({ where: { id: skip.id } })).toEqual(skip)
})

it('rejects attempts to create an online workshop through hidden input tampering', () => {
  expect(
    workshopSchema.safeParse({
      classSectionId: f.cls.id,
      workshopDefinitionId: 'fixture-definition-1',
      date: '2027-01-04',
      startTime: '10:00',
      endTime: '11:00',
      minPAs: 1,
      maxPAs: 2,
      mode: 'ONLINE',
    }).success
  ).toBe(false)
})
