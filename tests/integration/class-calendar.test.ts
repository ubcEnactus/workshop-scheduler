import { afterAll, beforeEach, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '../../src/lib/db'
import { resetFixtures, form, addCandidateFixture } from '../fixtures'
import { vancouverToUtc } from '../../src/lib/time'
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
  saveClassAvailability,
  removeClassAvailability,
  removeRecurringClassAvailability,
  saveRecurringClassAvailability,
} from '../../src/app/admin/classes/availability-actions'
import {
  saveWorkshopDefinition,
  scheduleCandidate,
} from '../../src/app/admin/class-workshops/actions'
import { createWorkshopBatchForm } from '../../src/app/admin/workshops/plan/actions'
import { createWorkshopBooking } from '../../src/app/admin/workshops/booking-actions'

let f: Awaited<ReturnType<typeof resetFixtures>>
beforeEach(async () => {
  f = await resetFixtures()
  sessionAuth.mockResolvedValue({ user: { id: f.admin.id } })
})
afterAll(() => prisma.$disconnect())
const date = (value: string) => new Date(value + 'T00:00:00Z')
async function window(start = '2027-01-04', end = '2027-01-08') {
  await prisma.workshopDefinition.update({
    where: { id: 'fixture-definition-1' },
    data: { deliveryStartsOn: date(start), deliveryEndsOn: date(end) },
  })
}
async function availability(day = '2027-01-04') {
  expect(
    await saveClassAvailability(
      {},
      form({ classSectionId: f.cls.id, date: day, startTime: '10:00', endTime: '12:00' })
    )
  ).toEqual({ saved: true })
  return prisma.availabilitySlot.findFirstOrThrow({
    where: { classSectionId: f.cls.id, start: vancouverToUtc(day, 600) },
  })
}
async function workshop(classId = f.cls.id, definition = 'fixture-definition-1') {
  return prisma.classWorkshop.create({
    data: { classSectionId: classId, workshopDefinitionId: definition },
  })
}
function booking(cw: { id: string }, slot: { id: string; updatedAt: Date }) {
  return form({
    classWorkshopId: cw.id,
    slotId: slot.id,
    expectedUpdatedAt: slot.updatedAt.toISOString(),
    startTime: '10:00',
    endTime: '11:00',
    mode: 'IN_PERSON',
  })
}
it('rejects non-admins before parsing either class calendar action', async () => {
  for (const user of [f.teacher, f.pa]) {
    sessionAuth.mockResolvedValue({ user: { id: user.id } })
    for (const action of [saveClassAvailability, removeClassAvailability])
      await expect(action({}, new FormData())).rejects.toThrow('/403')
  }
})
it('shares class times across workshops, filters by window, and initializes new workshop status', async () => {
  await window()
  const slot = await availability()
  const one = await workshop()
  const two = await workshop(f.cls.id, 'fixture-definition-2')
  for (const id of [one.id, two.id])
    expect((await prisma.classWorkshop.findUniqueOrThrow({ where: { id } })).status).toBe(
      'READY_TO_SCHEDULE'
    )
  const other = await workshop(f.sibling.id)
  await expect(scheduleCandidate(booking(other, slot))).rejects.toThrow('availability%20changed')
  await window('2027-01-05', '2027-01-08')
  expect((await prisma.classWorkshop.findUniqueOrThrow({ where: { id: one.id } })).status).toBe(
    'NEEDS_AVAILABILITY'
  )
  await expect(scheduleCandidate(booking(one, slot))).rejects.toThrow('shared%20delivery%20window')
  await window()
  await expect(scheduleCandidate(booking(one, slot))).rejects.toThrow('saved=1')
  expect((await loadSchedule(prisma)).workshops[0].hostingValid).toBe(true)
  const remove = form({
    classSectionId: f.cls.id,
    id: slot.id,
    expectedUpdatedAt: slot.updatedAt.toISOString(),
  })
  expect(await removeClassAvailability({}, remove)).toMatchObject({
    error: expect.stringContaining('supports a booked session'),
  })
  expect(
    await saveClassAvailability(
      {},
      form({
        ...Object.fromEntries(remove),
        date: '2027-01-05',
        startTime: '10:00',
        endTime: '12:00',
      })
    )
  ).toMatchObject({ error: expect.stringContaining('supports a booked session') })
})
it('validates weekdays, reversed times, overlap, stale edits and class ownership', async () => {
  for (const invalid of [{ date: '2027-01-02' }, { endTime: '09:00' }])
    expect(
      await saveClassAvailability(
        {},
        form({
          classSectionId: f.cls.id,
          date: '2027-01-04',
          startTime: '10:00',
          endTime: '12:00',
          ...invalid,
        })
      )
    ).toHaveProperty('error')
  const slot = await availability()
  const edit = {
    classSectionId: f.cls.id,
    id: slot.id,
    expectedUpdatedAt: slot.updatedAt.toISOString(),
    date: '2027-01-05',
    startTime: '10:00',
    endTime: '12:00',
  }
  expect(
    await saveClassAvailability({}, form({ ...edit, classSectionId: f.sibling.id }))
  ).toHaveProperty('error')
  expect(
    await saveClassAvailability(
      {},
      form({ classSectionId: f.cls.id, date: '2027-01-04', startTime: '11:00', endTime: '13:00' })
    )
  ).toMatchObject({ error: expect.stringContaining('overlaps') })
  expect(await saveClassAvailability({}, form(edit))).toEqual({ saved: true })
  expect(await saveClassAvailability({}, form(edit))).toMatchObject({
    error: expect.stringContaining('changed'),
  })
  const updated = await prisma.availabilitySlot.findUniqueOrThrow({ where: { id: slot.id } })
  expect(
    await removeClassAvailability(
      {},
      form({ ...edit, expectedUpdatedAt: updated.updatedAt.toISOString() })
    )
  ).toEqual({ saved: true })
})
it('guards recurring block edits and removals with the last-seen revision', async () => {
  const block = f.cls.meetings[0]
  const values = {
    classSectionId: f.cls.id,
    id: block.id,
    expectedUpdatedAt: block.updatedAt.toISOString(),
    days: 0,
    startTime: '09:00',
    endTime: '11:00',
    effectiveFrom: '2027-01-01',
    activeForScheduling: 1,
  }
  expect(await saveRecurringClassAvailability({}, form(values))).toEqual({ saved: true })
  expect(await saveRecurringClassAvailability({}, form(values))).toMatchObject({
    error: expect.stringContaining('changed'),
  })
  expect(
    await removeRecurringClassAvailability(
      {},
      form({
        classSectionId: f.cls.id,
        id: block.id,
        expectedUpdatedAt: values.expectedUpdatedAt,
      })
    )
  ).toMatchObject({ error: expect.stringContaining('changed') })
  const updated = await prisma.classMeeting.findUniqueOrThrow({ where: { id: block.id } })
  expect(
    await removeRecurringClassAvailability(
      {},
      form({
        classSectionId: f.cls.id,
        id: block.id,
        expectedUpdatedAt: updated.updatedAt.toISOString(),
      })
    )
  ).toEqual({ saved: true })
})
it('enforces inclusive shared ranges in run batches', async () => {
  await window()
  const cw = await workshop()
  const batch = (day: string, requestKey: string) =>
    form({
      requestKey,
      workshopDefinitionId: 'fixture-definition-1',
      expectedDefinitionRevision: 0,
      classWorkshopId: cw.id,
      date: day,
      startTime: '10:00',
      mode: 'IN_PERSON',
    })
  expect(await createWorkshopBatchForm({}, batch('2027-01-11', randomUUID()))).toMatchObject({
    error: expect.stringContaining('shared delivery window'),
  })
  expect(await prisma.workshopBatch.count()).toBe(0)
  expect(await createWorkshopBatchForm({}, batch('2027-01-04', randomUUID()))).toMatchObject({
    destination: expect.stringContaining('batch='),
  })
  expect(await prisma.workshopSession.count()).toBe(1)
})
it('does not widen old workshop-specific candidates and rejects invalid or booking-excluding window edits', async () => {
  const legacy = await addCandidateFixture(f.cls.id, '2027-01-04')
  const two = await workshop(f.cls.id, 'fixture-definition-2')
  await expect(
    scheduleCandidate(
      booking(two, { id: legacy.slotId, updatedAt: new Date(legacy.expectedUpdatedAt) })
    )
  ).rejects.toThrow('availability%20changed')
  await expect(
    scheduleCandidate(
      booking(
        { id: legacy.classWorkshopId },
        { id: legacy.slotId, updatedAt: new Date(legacy.expectedUpdatedAt) }
      )
    )
  ).rejects.toThrow('saved=1')
  const before = await prisma.workshopSession.findFirstOrThrow()
  const definition = {
    id: 'fixture-definition-1',
    number: 1,
    title: 'Workshop 1',
    description: '',
    durationMinutes: 60,
    defaultMinPAs: 1,
    defaultMaxPAs: 3,
  }
  for (const ranges of [
    { deliveryStart: '2027-01-05', deliveryEnd: '2027-01-08' },
    { deliveryStart: '2027-01-08', deliveryEnd: '2027-01-04' },
    { deliveryStart: '2027-01-04', deliveryEnd: '' },
  ])
    await expect(saveWorkshopDefinition(form({ ...definition, ...ranges }))).rejects.toThrow(
      'error='
    )
  expect(await prisma.workshopSession.findFirstOrThrow()).toEqual(before)
  await expect(
    saveWorkshopDefinition(
      form({ ...definition, deliveryStart: '2027-01-04', deliveryEnd: '2027-01-04' })
    )
  ).rejects.toThrow('REDIRECT:/admin/workshop-definitions')
  expect(
    (await prisma.workshopDefinition.findUniqueOrThrow({ where: { id: definition.id } }))
      .deliveryEndsOn
  ).toEqual(date('2027-01-04'))
})
it('direct booking cannot bypass the shared date window and rolls back newly created records', async () => {
  await window()
  const result = await createWorkshopBooking(
    {},
    form({
      requestKey: randomUUID(),
      workshopDefinitionId: 'fixture-definition-1',
      schoolChoice: f.school.id,
      teacherChoice: f.teacher.id,
      classChoice: f.cls.id,
      date: '2027-01-11',
      startTime: '10:00',
      endTime: '11:00',
      minPAs: 1,
      maxPAs: 2,
    })
  )
  expect(result).toMatchObject({ error: expect.stringContaining('shared delivery window') })
  expect(await prisma.workshopSession.count()).toBe(0)
  expect(await prisma.classWorkshop.count()).toBe(0)
  expect(await prisma.availabilitySlot.count()).toBe(0)
})
