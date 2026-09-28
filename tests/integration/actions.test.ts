import { addCandidateFixture } from '../fixtures'
import { createSessionFixture } from '../fixtures'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../src/lib/db'
import { form, resetFixtures, workshopForm } from '../fixtures'
import { vancouverMonthBounds, vancouverToUtc } from '../../src/lib/time'

const { sessionAuth } = vi.hoisted(() => ({ sessionAuth: vi.fn() }))
// Mock only the HTTP session boundary; real requireRole reloads the database
// user, and the actual Server Actions use real migrated PostgreSQL transactions.
vi.mock('next-auth', () => ({ default: () => ({ auth: sessionAuth }) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { getCurrentUser, requireRole } from '../../src/lib/auth'
import * as schools from '../../src/app/admin/schools/actions'
import * as teachers from '../../src/app/admin/teachers/actions'
import * as pas from '../../src/app/admin/pas/actions'
import * as admins from '../../src/app/admin/admins/actions'
import * as classes from '../../src/app/admin/classes/actions'
import * as workshops from '../../src/app/admin/workshops/actions'
import { saveAvailability } from '../../src/app/pa/availability/actions'

let fixtures: Awaited<ReturnType<typeof resetFixtures>>
beforeEach(async () => {
  fixtures = await resetFixtures()
  await addCandidateFixture(fixtures.cls.id, '2027-01-04', 'fixture-definition-1', 540, 720)
  await addCandidateFixture(fixtures.sibling.id, '2027-01-04', 'fixture-definition-1', 540, 720)
  await addCandidateFixture(fixtures.cls.id, '2027-02-01', 'fixture-definition-1', 540, 720)
  await addCandidateFixture(fixtures.cls.id, '2027-01-04', 'fixture-definition-2', 540, 720)
  sessionAuth.mockResolvedValue({ user: { id: fixtures.admin.id } })
})
afterAll(async () => {
  await prisma.$disconnect()
})

async function createDraft(overrides: Record<string, string | number> = {}) {
  await expect(workshops.createWorkshop(workshopForm(fixtures.cls.id, overrides))).rejects.toThrow(
    /REDIRECT:\/admin\/workshops\/.*saved=1/
  )
  return prisma.workshopSession.findFirstOrThrow({ orderBy: { createdAt: 'desc' } })
}

describe('authorization at the Server Action boundary', () => {
  const adminActions = { ...schools, ...teachers, ...pas, ...admins, ...classes, ...workshops }
  it.each(Object.entries(adminActions))(
    '%s rejects a PA and teacher before parsing or writing',
    async (_name, action) => {
      for (const user of [fixtures.pa, fixtures.teacher]) {
        sessionAuth.mockResolvedValue({ user: { id: user.id } })
        await expect(
          Reflect.apply(action, undefined, [new FormData(), new FormData()])
        ).rejects.toThrow('REDIRECT:/403')
      }
    }
  )
  it('requires a PA for availability and a live session for protected work', async () => {
    await expect(saveAvailability(new FormData())).rejects.toThrow('REDIRECT:/403')
    sessionAuth.mockResolvedValue(null)
    await expect(workshops.createWorkshop(new FormData())).rejects.toThrow('REDIRECT:/login')
  })
  it('reloads soft-delete, role and school changes from stale sessions', async () => {
    sessionAuth.mockResolvedValue({
      user: { id: fixtures.teacher.id, role: 'ADMIN', schoolId: 'stale' },
    })
    expect((await getCurrentUser())?.schoolId).toBe(fixtures.school.id)
    await expect(requireRole('ADMIN')).rejects.toThrow('REDIRECT:/403')
    await prisma.user.update({
      where: { id: fixtures.teacher.id },
      data: { deletedAt: new Date() },
    })
    await expect(requireRole('TEACHER')).rejects.toThrow('REDIRECT:/login')
  })
})

describe('foundation integrity', () => {
  it('lets an admin add another normalized admin account and rejects duplicate email', async () => {
    await expect(
      admins.createAdmin(form({ name: 'Second Admin', email: ' SECOND.ADMIN@Example.com ' }))
    ).rejects.toThrow('REDIRECT:/admin/admins?saved=1')
    const added = await prisma.user.findUniqueOrThrow({
      where: { email: 'second.admin@example.com' },
    })
    expect(added).toMatchObject({ name: 'Second Admin', role: 'ADMIN', schoolId: null })

    await expect(
      admins.createAdmin(form({ name: 'Duplicate', email: fixtures.pa.email }))
    ).rejects.toThrow('That%20email%20is%20already%20in%20use')
    expect(await prisma.user.count({ where: { email: fixtures.pa.email } })).toBe(1)
  })

  it('preserves workshop context through school, teacher, and class prerequisite setup', async () => {
    const setupContext = {
      returnToClasses: '1',
      month: '2027-10',
      returnSchoolId: fixtures.school.id,
      classSectionId: fixtures.cls.id,
      workshopDefinitionId: 'fixture-definition-1',
      batch: 'setup-batch',
      week: '2027-10-04',
    }
    await expect(
      schools.createSchool(form({ ...setupContext, name: 'Setup Flow School' }))
    ).rejects.toThrow(
      /REDIRECT:\/admin\/teachers\?.*schoolId=.*workshopDefinitionId=fixture-definition-1.*batch=setup-batch.*week=2027-10-04.*returnToClasses=1.*saved=school/
    )
    const school = await prisma.school.findFirstOrThrow({ where: { name: 'Setup Flow School' } })

    await expect(
      teachers.createTeacher(
        form({
          ...setupContext,
          name: 'Setup Flow Teacher',
          email: 'setup-flow-teacher@fixture.local',
          schoolId: school.id,
        })
      )
    ).rejects.toThrow(
      /REDIRECT:\/admin\/teachers\/[^?]+\?.*schoolId=.*workshopDefinitionId=fixture-definition-1.*batch=setup-batch.*week=2027-10-04.*saved=created#availability/
    )
    const teacher = await prisma.user.findFirstOrThrow({
      where: { email: 'setup-flow-teacher@fixture.local' },
    })

    await expect(
      classes.createClassSection(
        form({
          month: setupContext.month,
          schoolId: fixtures.school.id,
          classSectionId: setupContext.classSectionId,
          workshopDefinitionId: setupContext.workshopDefinitionId,
          batch: setupContext.batch,
          week: setupContext.week,
          name: 'Setup Flow Class',
          teacherId: teacher.id,
        })
      )
    ).rejects.toThrow(
      /REDIRECT:\/admin\/classes\/[^?]+\?.*workshopDefinitionId=fixture-definition-1.*batch=setup-batch.*week=2027-10-04.*saved=created#availability/
    )
    expect(
      await prisma.classSection.count({ where: { teacherId: teacher.id, schoolId: school.id } })
    ).toBe(1)
  })

  it('keeps teacher and class schools consistent under competing admin writes', async () => {
    await Promise.allSettled([
      classes.createClassSection(
        form({ name: 'Concurrent class', teacherId: fixtures.otherTeacher.id })
      ),
      teachers.updateTeacher(
        form({
          id: fixtures.otherTeacher.id,
          name: 'Moved',
          email: fixtures.otherTeacher.email,
          schoolId: fixtures.school.id,
        })
      ),
    ])
    const teacher = await prisma.user.findFirstOrThrow({
      where: { id: fixtures.otherTeacher.id, deletedAt: null },
    })
    const records = await prisma.classSection.findMany({ where: { teacherId: teacher.id } })
    for (const cls of records) expect(cls.schoolId).toBe(teacher.schoolId)
  })
  it('blocks moving a teacher with classes and permits a teacher without classes', async () => {
    await expect(
      teachers.updateTeacher(
        form({
          id: fixtures.teacher.id,
          name: 'Changed',
          email: fixtures.teacher.email,
          schoolId: fixtures.otherSchool.id,
        })
      )
    ).rejects.toThrow('preserve%20availability%20and%20workshop%20history')
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: fixtures.teacher.id } })).schoolId
    ).toBe(fixtures.school.id)
    await expect(
      teachers.updateTeacher(
        form({
          id: fixtures.otherTeacher.id,
          name: 'Moved',
          email: fixtures.otherTeacher.email,
          schoolId: fixtures.school.id,
        })
      )
    ).rejects.toThrow('REDIRECT:/admin/teachers')
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: fixtures.otherTeacher.id } })).schoolId
    ).toBe(fixtures.school.id)
  })
  it('routes teacher reassignment through the reviewed transfer workflow', async () => {
    const draft = await createDraft()
    await prisma.workshopSession.update({ where: { id: draft.id }, data: { status: 'CANCELLED' } })
    await expect(
      classes.updateClassSection(
        form({ id: fixtures.cls.id, name: 'Moved', teacherId: fixtures.otherTeacher.id })
      )
    ).rejects.toThrow('Each%20teacher%20owns%20their%20schedule')
    expect(
      (await prisma.classSection.findUniqueOrThrow({ where: { id: fixtures.cls.id } })).schoolId
    ).toBe(fixtures.school.id)
  })
  it('does not allow inline class reassignment before any workshop exists', async () => {
    await prisma.availabilitySlot.deleteMany()
    await prisma.classWorkshop.deleteMany()
    await expect(
      classes.updateClassSection(
        form({ id: fixtures.cls.id, name: 'Moved', teacherId: fixtures.otherTeacher.id })
      )
    ).rejects.toThrow('Each%20teacher%20owns%20their%20schedule')
    expect(
      (await prisma.classSection.findUniqueOrThrow({ where: { id: fixtures.cls.id } })).schoolId
    ).toBe(fixtures.school.id)
  })
  it('validates and atomically replaces only the signed-in PA’s availability', async () => {
    const draft = await createDraft()
    sessionAuth.mockResolvedValue({ user: { id: fixtures.pa.id } })
    const input = new FormData()
    input.append('slots', '0-600')
    input.append('slots', '0-600')
    input.append('slots', '1-630')
    input.set('effectiveFrom', '2027-01-01')
    input.set('userId', fixtures.admin.id)
    await expect(saveAvailability(input)).rejects.toThrow('saved=1')
    expect(await prisma.availability.count({ where: { userId: fixtures.pa.id } })).toBe(2)
    expect(await prisma.availability.count({ where: { userId: fixtures.admin.id } })).toBe(0)
    await expect(
      saveAvailability(form({ slots: '5-600', effectiveFrom: '2027-01-01' }))
    ).rejects.toThrow('error=1')
    expect(await prisma.availability.count()).toBe(2)
    await expect(saveAvailability(form({ effectiveFrom: '2027-01-01' }))).rejects.toThrow('saved=1')
    expect(await prisma.availability.count()).toBe(0)
    expect(
      await prisma.availabilityScheduleVersion.count({ where: { userId: fixtures.pa.id } })
    ).toBe(1)
    expect(
      (await prisma.workshopSession.findUniqueOrThrow({ where: { id: draft.id } })).scheduledStart
    ).toEqual(draft.scheduledStart)
  })
})

describe('dated workshops', () => {
  it('persists a draft and edits it into a different Vancouver month', async () => {
    const draft = await createDraft()
    expect(draft.status).toBe('DRAFT')
    expect(draft.scheduledStart).toEqual(vancouverToUtc('2027-01-04', 600))
    await expect(
      workshops.updateWorkshop(
        workshopForm(fixtures.cls.id, {
          id: draft.id,
          version: 0,
          date: '2027-02-01',
          startTime: '09:30',
          endTime: '10:30',
        })
      )
    ).rejects.toThrow('saved=1')
    const saved = await prisma.workshopSession.findUniqueOrThrow({ where: { id: draft.id } })
    expect(saved.version).toBe(1)
    const january = vancouverMonthBounds('2027-01')
    expect(
      await prisma.workshopSession.count({
        where: { scheduledStart: { gte: january.start, lt: january.end } },
      })
    ).toBe(0)
    const february = vancouverMonthBounds('2027-02')
    expect(
      await prisma.workshopSession.count({
        where: { scheduledStart: { gte: february.start, lt: february.end } },
      })
    ).toBe(1)
    await expect(
      workshops.updateWorkshop(workshopForm(fixtures.cls.id, { id: draft.id, version: 0 }))
    ).rejects.toThrow('Reload%20before%20editing')
    expect(
      (await prisma.workshopSession.findUniqueOrThrow({ where: { id: draft.id } })).scheduledStart
    ).toEqual(saved.scheduledStart)
  })
  it('requires hosting availability and unique enrollment but allows class and teacher overlaps', async () => {
    await expect(
      workshops.createWorkshop(workshopForm(fixtures.cls.id, { startTime: '08:30' }))
    ).rejects.toThrow('availability%20window')
    await createDraft()
    await expect(workshops.createWorkshop(workshopForm(fixtures.cls.id))).rejects.toThrow(
      'already%20has%20a%20scheduled'
    )
    await expect(workshops.createWorkshop(workshopForm(fixtures.sibling.id))).rejects.toThrow(
      /saved=1/
    )
    await createDraft({
      workshopDefinitionId: 'fixture-definition-2',
      startTime: '10:00',
      endTime: '11:00',
    })
    expect(await prisma.workshopSession.count()).toBe(3)
  })
  it('does not join adjacent blocks to host one workshop', async () => {
    await prisma.availabilitySlot.deleteMany()
    await prisma.classMeeting.deleteMany({ where: { classSectionId: fixtures.cls.id } })
    await addCandidateFixture(fixtures.cls.id, '2027-01-04', 'fixture-definition-1', 540, 630)
    await addCandidateFixture(fixtures.cls.id, '2027-01-04', 'fixture-definition-1', 630, 720)
    await expect(workshops.createWorkshop(workshopForm(fixtures.cls.id))).rejects.toThrow(
      'availability%20window'
    )
  })
  it('allows a replacement slot after cancellation and protects published/completed work', async () => {
    const draft = await createDraft()
    for (const status of ['PUBLISHED', 'COMPLETED', 'CANCELLED'] as const) {
      await prisma.workshopSession.update({ where: { id: draft.id }, data: { status } })
      await expect(
        workshops.updateWorkshop(workshopForm(fixtures.cls.id, { id: draft.id, version: 0 }))
      ).rejects.toThrow('Only%20unstaffed%20draft')
    }
    await createDraft()
    expect(await prisma.workshopSession.count()).toBe(2)
  })
  it('rejects inactive or inconsistent school/teacher records', async () => {
    await prisma.school.update({
      where: { id: fixtures.school.id },
      data: { deletedAt: new Date() },
    })
    await expect(workshops.createWorkshop(workshopForm(fixtures.cls.id))).rejects.toThrow(
      'active%20teacher'
    )
    await prisma.school.update({ where: { id: fixtures.school.id }, data: { deletedAt: null } })
    await prisma.user.update({
      where: { id: fixtures.teacher.id },
      data: { deletedAt: new Date() },
    })
    await expect(workshops.createWorkshop(workshopForm(fixtures.cls.id))).rejects.toThrow(
      'active%20teacher'
    )
    await prisma.user.update({
      where: { id: fixtures.teacher.id },
      data: { deletedAt: null, schoolId: fixtures.otherSchool.id },
    })
    await expect(workshops.createWorkshop(workshopForm(fixtures.cls.id))).rejects.toThrow(
      'active%20teacher'
    )
    expect(await prisma.workshopSession.count()).toBe(0)
  })
  it('does not move a workshop when hosting blocks change', async () => {
    const draft = await createDraft()
    await classes.deleteMeeting(form({ id: fixtures.cls.meetings[0].id }))
    expect(
      (await prisma.workshopSession.findUniqueOrThrow({ where: { id: draft.id } })).scheduledStart
    ).toEqual(draft.scheduledStart)
  })
  it('allows concurrent overlapping bookings for different classes with one teacher', async () => {
    await Promise.allSettled([
      workshops.createWorkshop(workshopForm(fixtures.cls.id)),
      workshops.createWorkshop(workshopForm(fixtures.sibling.id)),
    ])
    expect(await prisma.workshopSession.count()).toBe(2)
  })
  it('enforces duration and staffing bounds at the database boundary', async () => {
    const data = {
      classSectionId: fixtures.cls.id,
      scheduledStart: new Date('2027-01-04T18:00Z'),
      scheduledEnd: new Date('2027-01-04T17:00Z'),
    }
    await expect(createSessionFixture({ data })).rejects.toThrow()
    await expect(
      createSessionFixture({
        data: { ...data, scheduledEnd: new Date('2027-01-04T19:00Z'), minPAs: 3, maxPAs: 1 },
      })
    ).rejects.toThrow()
  })
})
