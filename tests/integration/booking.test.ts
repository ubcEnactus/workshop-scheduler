import { addSessionCandidateFixture } from '../fixtures'
import { createSessionFixture } from '../fixtures'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../src/lib/db'
import { loadSchedule } from '../../src/lib/scheduling/store'
import { vancouverToUtc } from '../../src/lib/time'
import { form, resetFixtures, staffingForm, workshopForm } from '../fixtures'

const { sessionAuth } = vi.hoisted(() => ({ sessionAuth: vi.fn() }))
vi.mock('next-auth', () => ({ default: () => ({ auth: sessionAuth }) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error('REDIRECT:' + url)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createWorkshopBooking } from '../../src/app/admin/workshops/booking-actions'
import { updateWorkshopForm } from '../../src/app/admin/workshops/actions'
import { assignPA, publishWorkshop } from '../../src/app/admin/staffing/actions'
import {
  applyWorkshopChange,
  stageWorkshopChange,
} from '../../src/app/admin/workshops/changes/actions'

let bookingNumber = 0
let f: Awaited<ReturnType<typeof resetFixtures>>

beforeEach(async () => {
  f = await resetFixtures()
  bookingNumber = 0
  sessionAuth.mockResolvedValue({ user: { id: f.admin.id } })
})

afterAll(async () => {
  await prisma.$disconnect()
})

function booking(overrides: Record<string, string | number> = {}) {
  return form({
    requestKey: randomUUID(),
    workshopDefinitionId: `fixture-definition-${++bookingNumber}`,
    schoolChoice: f.school.id,
    schoolName: '',
    teacherChoice: f.teacher.id,
    teacherName: '',
    teacherEmail: '',
    classChoice: f.cls.id,
    className: '',
    date: '2027-01-06',
    startTime: '10:00',
    endTime: '11:00',
    minPAs: 1,
    maxPAs: 3,
    month: '2027-01',
    view: 'draft',
    ...overrides,
  })
}

async function create(data: FormData) {
  await expect(createWorkshopBooking({}, data)).rejects.toThrow(
    /REDIRECT:\/admin\/workshops\/.*month=.*schoolId=.*classSectionId=.*saved=1/
  )
  return prisma.workshopSession.findFirstOrThrow({
    orderBy: { createdAt: 'desc' },
    include: { classWorkshop: true },
  })
}

describe('direct workshop booking', () => {
  it('books without a class label and reuses the same teacher’s workshop group', async () => {
    const first = await create(booking({ classChoice: '__new__', className: '' }))
    const second = await create(
      booking({ classChoice: '__new__', className: '   ', date: '2027-01-07' })
    )
    expect(second.classWorkshop.classSectionId).toBe(first.classWorkshop.classSectionId)
    const group = await prisma.classSection.findUniqueOrThrow({
      where: { id: first.classWorkshop.classSectionId },
      include: { meetings: true },
    })
    expect(group).toMatchObject({
      name: f.cls.name,
      teacherId: f.teacher.id,
      schoolId: f.school.id,
    })
    expect(group.meetings).toHaveLength(f.cls.meetings.length)
    const other = await create(
      booking({
        classChoice: '__new__',
        schoolChoice: f.otherSchool.id,
        teacherChoice: f.otherTeacher.id,
      })
    )
    expect(other.classWorkshop.classSectionId).not.toBe(first.classWorkshop.classSectionId)
  })

  it('authorizes before parsing', async () => {
    sessionAuth.mockResolvedValue({ user: { id: f.teacher.id } })
    await expect(createWorkshopBooking({}, new FormData())).rejects.toThrow('REDIRECT:/403')
  })

  it('creates the foundation and one private confirmed draft atomically', async () => {
    await prisma.classMeeting.deleteMany()
    await prisma.classSection.deleteMany()
    await prisma.user.deleteMany({ where: { role: 'TEACHER' } })
    await prisma.school.deleteMany()
    const workshop = await create(
      booking({
        schoolChoice: '__new__',
        schoolName: 'Cedar School',
        teacherChoice: '__new__',
        teacherName: 'Alex Teacher',
        teacherEmail: 'ALEX@example.test',
        classChoice: '__new__',
        className: 'Science 10',
      })
    )
    const cls = await prisma.classSection.findUniqueOrThrow({
      where: { id: workshop.classWorkshop.classSectionId },
      include: { school: true, teacher: true, meetings: true },
    })
    expect(cls.school).toMatchObject({ name: 'Cedar School' })
    expect(cls.teacher).toMatchObject({
      name: 'Alex Teacher',
      email: 'alex@example.test',
      role: 'TEACHER',
      schoolId: cls.schoolId,
    })
    expect(cls.meetings).toEqual([])
    expect(workshop).toMatchObject({
      status: 'DRAFT',
      hostingConfirmed: true,
      publishedAt: null,
    })
    expect(await prisma.assignment.count()).toBe(0)
    expect(await prisma.workshopBatch.count()).toBe(1)
  })

  it('reuses normalized new schools, teacher emails, and class names', async () => {
    await create(
      booking({
        schoolChoice: '__new__',
        schoolName: '  New   School ',
        teacherChoice: '__new__',
        teacherName: 'First Name',
        teacherEmail: 'same@example.test',
        classChoice: '__new__',
        className: ' Grade   Ten ',
      })
    )
    await create(
      booking({
        schoolChoice: '__new__',
        schoolName: 'new school',
        teacherChoice: '__new__',
        teacherName: 'Ignored Rename',
        teacherEmail: 'SAME@example.test',
        classChoice: '__new__',
        className: 'grade ten',
        date: '2027-01-07',
      })
    )
    expect(await prisma.school.count({ where: { name: 'New   School' } })).toBe(1)
    const teacher = await prisma.user.findUniqueOrThrow({ where: { email: 'same@example.test' } })
    expect(teacher.name).toBe('First Name')
    expect(await prisma.classSection.count({ where: { teacherId: teacher.id } })).toBe(1)
    expect(
      await prisma.workshopSession.count({
        where: { classWorkshop: { classSection: { teacherId: teacher.id } } },
      })
    ).toBe(2)
  })

  it('infers an existing class relationship and rejects inconsistent selections', async () => {
    const created = await create(booking())
    expect(created.classWorkshop.classSectionId).toBe(f.cls.id)
    const result = await createWorkshopBooking(
      {},
      booking({ schoolChoice: f.otherSchool.id, date: '2027-01-07' })
    )
    expect(result.error).toMatch(/no longer match/i)
    expect(await prisma.workshopSession.count()).toBe(1)
  })

  it('rejects foreign, deleted, wrong-role, and colliding email relationships', async () => {
    expect(
      (
        await createWorkshopBooking(
          {},
          booking({
            classChoice: '__new__',
            className: 'Foreign',
            teacherChoice: f.otherTeacher.id,
          })
        )
      ).error
    ).toMatch(/active teacher/i)
    expect(
      (
        await createWorkshopBooking(
          {},
          booking({ classChoice: '__new__', className: 'Wrong role', teacherChoice: f.pa.id })
        )
      ).error
    ).toMatch(/active teacher/i)
    await prisma.school.update({ where: { id: f.school.id }, data: { deletedAt: new Date() } })
    expect(
      (
        await createWorkshopBooking(
          {},
          booking({ classChoice: '__new__', className: 'Deleted school class' })
        )
      ).error
    ).toMatch(/active school/i)
    await prisma.school.update({ where: { id: f.school.id }, data: { deletedAt: null } })
    for (const email of [f.pa.email, f.deleted.email, f.otherTeacher.email]) {
      const result = await createWorkshopBooking(
        {},
        booking({
          teacherChoice: '__new__',
          teacherName: 'Collision',
          teacherEmail: email,
          classChoice: '__new__',
          className: 'Collision class',
        })
      )
      expect(result.error).toMatch(/another or inactive account/i)
    }
    expect(await prisma.workshopSession.count()).toBe(0)
  })

  it('reuses the teacher profile when a stale client supplies another class label', async () => {
    await create(booking({ date: '2027-01-04' }))
    await create(
      booking({ classChoice: '__new__', className: 'Concurrent class', date: '2027-01-04' })
    )
    expect(await prisma.classSection.count({ where: { name: 'Concurrent class' } })).toBe(0)
    expect(await prisma.classSection.count({ where: { teacherId: f.teacher.id } })).toBe(1)
    expect(await prisma.workshopSession.count()).toBe(2)
    expect(await prisma.workshopBatch.count()).toBe(2)
  })

  it('permits overlapping bookings with shared or different teachers', async () => {
    await create(booking({ date: '2027-01-04' }))
    await create(
      booking({ classChoice: f.sibling.id, teacherChoice: f.siblingTeacher.id, date: '2027-01-04' })
    )
    await create(
      booking({
        schoolChoice: f.otherSchool.id,
        teacherChoice: f.otherTeacher.id,
        classChoice: '__new__',
        className: 'Other class',
        date: '2027-01-04',
      })
    )
    expect(await prisma.workshopSession.count()).toBe(3)
  })

  it('is idempotent for concurrent retries and rejects changed payloads or actors', async () => {
    const requestKey = randomUUID()
    const data = booking({ requestKey })
    const results = await Promise.allSettled([
      createWorkshopBooking({}, data),
      createWorkshopBooking({}, data),
    ])
    for (const result of results)
      expect(result.status === 'rejected' && result.reason.message).toMatch(/saved=1/)
    expect(await prisma.workshopSession.count()).toBe(1)
    expect(await prisma.workshopBatch.count()).toBe(1)

    const booked = await prisma.workshopSession.findFirstOrThrow()
    await prisma.workshopSession.update({
      where: { id: booked.id },
      data: {
        scheduledStart: new Date('2027-02-03T18:00:00.000Z'),
        scheduledEnd: new Date('2027-02-03T19:00:00.000Z'),
      },
    })
    await expect(createWorkshopBooking({}, data)).rejects.toThrow(/month=2027-02.*view=all/)

    const changed = await createWorkshopBooking(
      {},
      booking({ requestKey, startTime: '11:00', endTime: '12:00' })
    )
    expect(changed.error).toMatch(/different workshop choices/i)

    const otherAdmin = await prisma.user.create({
      data: { email: 'admin2@example.test', role: 'ADMIN' },
    })
    sessionAuth.mockResolvedValue({ user: { id: otherAdmin.id } })
    const otherActor = await createWorkshopBooking({}, booking({ requestKey }))
    expect(otherActor.error).toMatch(/different workshop choices/i)
    expect(await prisma.workshopSession.count()).toBe(1)
  })

  it('preserves occurrence confirmation when direct workshops are edited or rescheduled', async () => {
    const direct = await create(booking())
    const snapshot = await loadSchedule(prisma)
    expect(snapshot.workshops.find((workshop) => workshop.id === direct.id)?.hostingValid).toBe(
      true
    )

    await addSessionCandidateFixture(direct.id, '2027-01-07', 780, 840)
    await expect(
      updateWorkshopForm(
        {},
        workshopForm(f.cls.id, {
          id: direct.id,
          version: 0,
          date: '2027-01-07',
          startTime: '13:00',
          endTime: '14:00',
        })
      )
    ).rejects.toThrow(/saved=1/)
    expect(
      (await prisma.workshopSession.findUniqueOrThrow({ where: { id: direct.id } }))
        .hostingConfirmed
    ).toBe(true)
    expect(
      (
        await updateWorkshopForm(
          {},
          workshopForm(f.sibling.id, {
            id: direct.id,
            version: 1,
            date: '2027-01-08',
            startTime: '13:00',
            endTime: '14:00',
          })
        )
      ).error
    ).toMatch(/availability|Enroll this teacher|already has/i)
    expect(
      (
        await prisma.workshopSession.findUniqueOrThrow({
          where: { id: direct.id },
          include: { classWorkshop: true },
        })
      ).classWorkshop.classSectionId
    ).toBe(f.cls.id)

    const legacy = await createSessionFixture({
      data: {
        classSectionId: f.cls.id,
        scheduledStart: new Date('2027-01-08T18:00:00.000Z'),
        scheduledEnd: new Date('2027-01-08T19:00:00.000Z'),
      },
    })
    expect(
      (
        await updateWorkshopForm(
          {},
          workshopForm(f.cls.id, {
            id: legacy.id,
            version: 0,
            date: '2027-01-08',
            startTime: '13:00',
            endTime: '14:00',
          })
        )
      ).error
    ).toMatch(/availability|Enroll this teacher|already has/i)
  })

  it('revalidates assigned PA constraints while rescheduling a published direct booking', async () => {
    await prisma.classMeeting.deleteMany({ where: { classSectionId: f.cls.id } })
    await prisma.schedulingSettings.update({
      where: { id: 1 },
      data: { minimumGapDays: 1 },
    })
    await prisma.monthlyPAQuota.create({
      data: { paId: f.pa.id, month: '2027-01', quota: 2 },
    })
    await prisma.availability.createMany({
      data: [600, 615, 630, 645].map((startMin) => ({ userId: f.pa.id, dayOfWeek: 2, startMin })),
    })

    const direct = await create(booking())
    await expect(assignPA(await staffingForm(direct.id, 0, f.pa.id))).rejects.toThrow(/staffed=1/)
    await expect(publishWorkshop(form({ id: direct.id, version: 1 }))).rejects.toThrow(
      /published=1/
    )
    let snapshot = await loadSchedule(prisma)
    let scheduled = snapshot.workshops.find((workshop) => workshop.id === direct.id)!
    expect(scheduled.status).toBe('PUBLISHED')
    expect(scheduled.hostingValid).toBe(true)

    const move = {
      id: direct.id,
      version: 2,
      kind: 'RESCHEDULE',
      date: '2027-01-07',
      startTime: '13:00',
      endTime: '14:00',
      reason: 'Host confirmed a new time.',
    }
    await addSessionCandidateFixture(direct.id, move.date, 780, 840)
    await expect(stageWorkshopChange(form(move))).rejects.toThrow(
      /REDIRECT:\/admin\/workshops\/changes\//
    )
    expect(
      (await prisma.workshopSession.findUniqueOrThrow({ where: { id: direct.id } })).scheduledStart
    ).toEqual(direct.scheduledStart)

    await prisma.availability.createMany({
      data: [780, 795, 810, 825].map((startMin) => ({
        userId: f.pa.id,
        dayOfWeek: 3,
        startMin,
      })),
    })
    const conflict = await createSessionFixture({
      data: {
        classSectionId: f.sibling.id,
        scheduledStart: vancouverToUtc(move.date, 780),
        scheduledEnd: vancouverToUtc(move.date, 840),
      },
    })
    await expect(stageWorkshopChange(form(move))).rejects.toThrow(
      /REDIRECT:\/admin\/workshops\/changes\//
    )
    await prisma.workshopSession.delete({ where: { id: conflict.id } })

    await expect(stageWorkshopChange(form(move))).rejects.toThrow(
      /REDIRECT:\/admin\/workshops\/changes\//
    )
    const change = await prisma.workshopChange.findFirstOrThrow({
      where: { workshopSessionId: direct.id, appliedAt: null },
      orderBy: { createdAt: 'desc' },
    })
    await prisma.availability.deleteMany({
      where: { userId: f.pa.id, dayOfWeek: 3 },
    })
    await expect(applyWorkshopChange(form({ id: change.id }))).rejects.toThrow(/Availability/)
    expect(
      (await prisma.workshopChange.findUniqueOrThrow({ where: { id: change.id } })).appliedAt
    ).toBe(null)
    await prisma.availability.createMany({
      data: [780, 795, 810, 825].map((startMin) => ({
        userId: f.pa.id,
        dayOfWeek: 3,
        startMin,
      })),
    })
    await expect(stageWorkshopChange(form(move))).rejects.toThrow(
      /REDIRECT:\/admin\/workshops\/changes\//
    )
    const refreshed = await prisma.workshopChange.findFirstOrThrow({
      where: { workshopSessionId: direct.id, appliedAt: null, id: { not: change.id } },
      orderBy: { createdAt: 'desc' },
    })
    await expect(applyWorkshopChange(form({ id: refreshed.id }))).rejects.toThrow(/changed=1/)

    const saved = await prisma.workshopSession.findUniqueOrThrow({
      where: { id: direct.id },
      include: { assignments: true },
    })
    expect(saved).toMatchObject({
      status: 'PUBLISHED',
      hostingConfirmed: true,
      scheduledStart: vancouverToUtc(move.date, 780),
      scheduledEnd: vancouverToUtc(move.date, 840),
    })
    expect(saved.assignments).toMatchObject([{ paId: f.pa.id, status: 'PUBLISHED' }])
    snapshot = await loadSchedule(prisma)
    scheduled = snapshot.workshops.find((workshop) => workshop.id === direct.id)!
    expect(scheduled.hostingValid).toBe(true)
  })
})
