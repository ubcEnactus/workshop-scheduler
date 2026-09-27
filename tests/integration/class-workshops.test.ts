import { afterAll, beforeEach, expect, it, vi } from 'vitest'
import { prisma } from '../../src/lib/db'
import {
  resetFixtures,
  form,
  addCandidateFixture,
  createSessionFixture,
  staffingForm,
} from '../fixtures'
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
import * as actions from '../../src/app/admin/class-workshops/actions'
import { assignPA } from '../../src/app/admin/staffing/actions'
let f: Awaited<ReturnType<typeof resetFixtures>>
beforeEach(async () => {
  f = await resetFixtures()
  await prisma.schedulingSettings.update({ where: { id: 1 }, data: { minimumGapDays: 1 } })
  sessionAuth.mockResolvedValue({ user: { id: f.admin.id } })
})
afterAll(() => prisma.$disconnect())
function schedule(slot: Awaited<ReturnType<typeof addCandidateFixture>>) {
  return form({
    ...slot,
    startTime: '10:00',
    endTime: '11:00',
    mode: 'IN_PERSON',
    location: 'Room 12',
    notes: 'Bring materials',
  })
}
it.each(Object.entries(actions))(
  '%s rejects teachers and PAs before parsing',
  async (_name, action) => {
    for (const user of [f.teacher, f.pa]) {
      sessionAuth.mockResolvedValue({ user: { id: user.id } })
      await expect(action(new FormData())).rejects.toThrow('/403')
    }
  }
)
it('creates a workshop and redirects into its Add classes workspace', async () => {
  let redirectMessage = ''
  try {
    await actions.saveWorkshopDefinition(
      form({
        title: 'Title-first integration workshop',
        number: '',
        description: '',
        durationMinutes: 60,
        defaultMinPAs: 1,
        defaultMaxPAs: 3,
        deliveryStart: '2027-02-01',
        deliveryEnd: '2027-02-19',
      })
    )
  } catch (error) {
    if (!(error instanceof Error)) throw error
    redirectMessage = error.message
  }
  const created = await prisma.workshopDefinition.findFirstOrThrow({
    where: { title: 'Title-first integration workshop' },
  })
  expect(redirectMessage).toBe(`REDIRECT:/admin/workshop-definitions/${created.id}?created=1`)
  expect(created).toMatchObject({ number: null, defaultMinPAs: 1, defaultMaxPAs: 3 })
})
it('models many classes and definitions through unique class workshop pairs', async () => {
  for (const [classSectionId, workshopDefinitionId] of [
    [f.cls.id, 'fixture-definition-1'],
    [f.cls.id, 'fixture-definition-2'],
    [f.sibling.id, 'fixture-definition-1'],
  ])
    await expect(
      actions.addClassWorkshop(form({ classSectionId, workshopDefinitionId }))
    ).rejects.toThrow('/admin/class-workshops/')
  expect(await prisma.classWorkshop.count({ where: { classSectionId: f.cls.id } })).toBe(2)
  expect(
    await prisma.classWorkshop.count({ where: { workshopDefinitionId: 'fixture-definition-1' } })
  ).toBe(2)
  await expect(
    prisma.classWorkshop.create({
      data: { classSectionId: f.cls.id, workshopDefinitionId: 'fixture-definition-1' },
    })
  ).rejects.toThrow()
  expect((await prisma.classWorkshop.findFirstOrThrow()).status).toBe('NEEDS_AVAILABILITY')
})
it('adds, edits and removes multiple explicit windows without leaking to another workshop', async () => {
  const one = await addCandidateFixture(f.cls.id, '2027-01-04')
  const other = await prisma.classWorkshop.create({
    data: { classSectionId: f.cls.id, workshopDefinitionId: 'fixture-definition-2' },
  })
  await expect(
    actions.saveAvailabilitySlot(
      form({
        classWorkshopId: one.classWorkshopId,
        date: '2027-01-11',
        startTime: '08:40',
        endTime: '09:50',
        notes: 'Teacher option 2',
      })
    )
  ).rejects.toThrow('/admin/class-workshops/')
  expect(
    await prisma.availabilitySlot.count({ where: { classWorkshopId: one.classWorkshopId } })
  ).toBe(2)
  expect(await prisma.availabilitySlot.count({ where: { classWorkshopId: other.id } })).toBe(0)
  await expect(
    actions.scheduleCandidate(schedule({ ...one, classWorkshopId: other.id }))
  ).rejects.toThrow('availability%20changed')
  const edit = form({
    id: one.slotId,
    classWorkshopId: one.classWorkshopId,
    expectedUpdatedAt: one.expectedUpdatedAt,
    date: '2027-01-05',
    startTime: '10:00',
    endTime: '11:00',
  })
  await expect(actions.saveAvailabilitySlot(edit)).rejects.toThrow('/admin/class-workshops/')
  await expect(actions.saveAvailabilitySlot(edit)).rejects.toThrow('availability%20changed')
  for (const slot of await prisma.availabilitySlot.findMany({
    where: { classWorkshopId: one.classWorkshopId },
  }))
    await expect(
      actions.removeAvailabilitySlot(
        form({
          classWorkshopId: one.classWorkshopId,
          id: slot.id,
          expectedUpdatedAt: slot.updatedAt.toISOString(),
        })
      )
    ).rejects.toThrow('/admin/class-workshops/')
  expect(
    (await prisma.classWorkshop.findUniqueOrThrow({ where: { id: one.classWorkshopId } })).status
  ).toBe('NEEDS_AVAILABILITY')
})
it('schedules only once, preserves booked candidates, and attaches PA assignments to the session', async () => {
  const slot = await addCandidateFixture(f.cls.id, '2027-01-04')
  expect(
    (await prisma.classWorkshop.findUniqueOrThrow({ where: { id: slot.classWorkshopId } })).status
  ).toBe('READY_TO_SCHEDULE')
  await Promise.allSettled([
    actions.scheduleCandidate(schedule(slot)),
    actions.scheduleCandidate(schedule(slot)),
  ])
  expect(await prisma.workshopSession.count()).toBe(1)
  const session = await prisma.workshopSession.findFirstOrThrow()
  expect(session).toMatchObject({
    classWorkshopId: slot.classWorkshopId,
    status: 'DRAFT',
    scheduledStart: vancouverToUtc('2027-01-04', 600),
    location: 'Room 12',
    notes: 'Bring materials',
  })
  await expect(
    actions.removeAvailabilitySlot(
      form({
        classWorkshopId: slot.classWorkshopId,
        id: slot.slotId,
        expectedUpdatedAt: slot.expectedUpdatedAt,
      })
    )
  ).rejects.toThrow('supports%20a%20scheduled')
  await prisma.monthlyPAQuota.create({ data: { paId: f.pa.id, month: '2027-01', quota: 2 } })
  await prisma.availability.createMany({
    data: [600, 615, 630, 645].map((startMin) => ({ userId: f.pa.id, dayOfWeek: 0, startMin })),
  })
  await expect(assignPA(await staffingForm(session.id, 0, f.pa.id))).rejects.toThrow('staffed=1')
  expect(await prisma.assignment.findFirstOrThrow()).toMatchObject({
    workshopSessionId: session.id,
    paId: f.pa.id,
  })
  const snapshot = await loadSchedule(prisma)
  expect(snapshot.workshops[0]).toMatchObject({
    id: session.id,
    classSectionId: f.cls.id,
    definitionTitle: 'Workshop 1',
    hostingValid: true,
  })
  await prisma.workshopSession.update({ where: { id: session.id }, data: { status: 'COMPLETED' } })
  expect(
    (await prisma.classWorkshop.findUniqueOrThrow({ where: { id: slot.classWorkshopId } })).status
  ).toBe('COMPLETED')
  await expect(
    prisma.workshopSession.create({
      data: {
        classWorkshopId: slot.classWorkshopId,
        scheduledStart: session.scheduledStart,
        scheduledEnd: session.scheduledEnd,
      },
    })
  ).rejects.toThrow()
})
it('rejects stale, invalid and inactive candidate scheduling without writes', async () => {
  const slot = await addCandidateFixture(f.cls.id, '2027-01-04')
  const outside = schedule(slot)
  outside.set('endTime', '12:00')
  await expect(actions.scheduleCandidate(outside)).rejects.toThrow('availability%20window')
  await prisma.availabilitySlot.update({ where: { id: slot.slotId }, data: { notes: 'Changed' } })
  await expect(actions.scheduleCandidate(schedule(slot))).rejects.toThrow('availability%20changed')
  await prisma.school.update({ where: { id: f.school.id }, data: { deletedAt: new Date() } })
  await expect(actions.scheduleCandidate(schedule(slot))).rejects.toThrow('active%20teacher')
  expect(await prisma.workshopSession.count()).toBe(0)
})

it('identifies an imported definition without replacing the session, assignments or dates', async () => {
  const session = await createSessionFixture({
    data: {
      classSectionId: f.cls.id,
      scheduledStart: vancouverToUtc('2027-01-04', 600),
      scheduledEnd: vancouverToUtc('2027-01-04', 660),
      locked: true,
      assignments: { create: { paId: f.pa.id } },
    },
  })
  const cw = await prisma.classWorkshop.findUniqueOrThrow({
    where: { id: session.classWorkshopId },
  })
  await prisma.workshopDefinition.update({
    where: { id: cw.workshopDefinitionId },
    data: { identityStatus: 'NEEDS_IDENTIFICATION' },
  })
  const assignment = await prisma.assignment.findFirstOrThrow()
  await expect(
    actions.identifyImportedWorkshop(
      form({
        classWorkshopId: cw.id,
        workshopDefinitionId: 'fixture-definition-1',
        expectedUpdatedAt: cw.updatedAt.toISOString(),
      })
    )
  ).rejects.toThrow('/admin/class-workshops/')
  expect(
    await prisma.workshopSession.findUniqueOrThrow({ where: { id: session.id } })
  ).toMatchObject({
    classWorkshopId: cw.id,
    scheduledStart: session.scheduledStart,
    scheduledEnd: session.scheduledEnd,
    locked: true,
    version: 1,
  })
  expect(await prisma.assignment.findUniqueOrThrow({ where: { id: assignment.id } })).toEqual(
    assignment
  )
  expect(
    (await prisma.classWorkshop.findUniqueOrThrow({ where: { id: cw.id } })).workshopDefinitionId
  ).toBe('fixture-definition-1')
})
