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
import * as classes from '../../src/app/admin/classes/actions'
import * as workshops from '../../src/app/admin/workshops/actions'
import { saveAvailability } from '../../src/app/pa/availability/actions'

let fixtures: Awaited<ReturnType<typeof resetFixtures>>
beforeEach(async () => {
  fixtures = await resetFixtures()
  sessionAuth.mockResolvedValue({ user: { id: fixtures.admin.id } })
})
afterAll(async () => {
  await prisma.$disconnect()
})

async function createDraft(overrides: Record<string, string | number> = {}) {
  await expect(workshops.createWorkshop(workshopForm(fixtures.cls.id, overrides))).rejects.toThrow(
    /REDIRECT:\/admin\/workshops\/.*saved=1/
  )
  return prisma.workshop.findFirstOrThrow({ orderBy: { createdAt: 'desc' } })
}

describe('authorization at the Server Action boundary', () => {
  const adminActions = { ...schools, ...teachers, ...pas, ...classes, ...workshops }
  it.each(Object.entries(adminActions))(
    '%s rejects a PA and teacher before parsing or writing',
    async (_name, action) => {
      for (const user of [fixtures.pa, fixtures.teacher]) {
        sessionAuth.mockResolvedValue({ user: { id: user.id } })
        await expect(action(new FormData())).rejects.toThrow('REDIRECT:/403')
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
    ).rejects.toThrow('before%20changing%20their%20school')
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
  it('prevents class reassignment from changing workshop history, even when cancelled', async () => {
    const draft = await createDraft()
    await prisma.workshop.update({ where: { id: draft.id }, data: { status: 'CANCELLED' } })
    await expect(
      classes.updateClassSection(
        form({ id: fixtures.cls.id, name: 'Moved', teacherId: fixtures.otherTeacher.id })
      )
    ).rejects.toThrow('workshop%20history')
    expect(
      (await prisma.classSection.findUniqueOrThrow({ where: { id: fixtures.cls.id } })).schoolId
    ).toBe(fixtures.school.id)
  })
  it('allows class reassignment before any workshop exists', async () => {
    await expect(
      classes.updateClassSection(
        form({ id: fixtures.cls.id, name: 'Moved', teacherId: fixtures.otherTeacher.id })
      )
    ).rejects.toThrow('REDIRECT:/admin/classes')
    expect(
      (await prisma.classSection.findUniqueOrThrow({ where: { id: fixtures.cls.id } })).schoolId
    ).toBe(fixtures.otherSchool.id)
  })
  it('validates and atomically replaces only the signed-in PA’s availability', async () => {
    const draft = await createDraft()
    sessionAuth.mockResolvedValue({ user: { id: fixtures.pa.id } })
    const input = new FormData()
    input.append('slots', '0-600')
    input.append('slots', '0-600')
    input.append('slots', '1-630')
    input.set('userId', fixtures.admin.id)
    await expect(saveAvailability(input)).rejects.toThrow('saved=1')
    expect(await prisma.availability.count({ where: { userId: fixtures.pa.id } })).toBe(2)
    expect(await prisma.availability.count({ where: { userId: fixtures.admin.id } })).toBe(0)
    await expect(saveAvailability(form({ slots: '5-600' }))).rejects.toThrow('error=1')
    expect(await prisma.availability.count()).toBe(2)
    await expect(saveAvailability(new FormData())).rejects.toThrow('saved=1')
    expect(await prisma.availability.count()).toBe(0)
    expect(
      (await prisma.workshop.findUniqueOrThrow({ where: { id: draft.id } })).scheduledStart
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
    const saved = await prisma.workshop.findUniqueOrThrow({ where: { id: draft.id } })
    expect(saved.version).toBe(1)
    const january = vancouverMonthBounds('2027-01')
    expect(
      await prisma.workshop.count({
        where: { scheduledStart: { gte: january.start, lt: january.end } },
      })
    ).toBe(0)
    const february = vancouverMonthBounds('2027-02')
    expect(
      await prisma.workshop.count({
        where: { scheduledStart: { gte: february.start, lt: february.end } },
      })
    ).toBe(1)
    await expect(
      workshops.updateWorkshop(workshopForm(fixtures.cls.id, { id: draft.id, version: 0 }))
    ).rejects.toThrow('Reload%20before%20editing')
    expect(
      (await prisma.workshop.findUniqueOrThrow({ where: { id: draft.id } })).scheduledStart
    ).toEqual(saved.scheduledStart)
  })
  it('requires full containment within a single block and rejects class or teacher overlaps', async () => {
    await expect(
      workshops.createWorkshop(workshopForm(fixtures.cls.id, { startTime: '08:30' }))
    ).rejects.toThrow('hosting%20block')
    await createDraft()
    await expect(workshops.createWorkshop(workshopForm(fixtures.cls.id))).rejects.toThrow(
      'overlapping%20workshop'
    )
    await expect(workshops.createWorkshop(workshopForm(fixtures.sibling.id))).rejects.toThrow(
      'overlapping%20workshop'
    )
    await createDraft({ startTime: '11:00', endTime: '12:00' })
    expect(await prisma.workshop.count()).toBe(2)
  })
  it('does not join adjacent blocks to host one workshop', async () => {
    await prisma.classMeeting.deleteMany({ where: { classSectionId: fixtures.cls.id } })
    await prisma.classMeeting.createMany({
      data: [
        { classSectionId: fixtures.cls.id, dayOfWeek: 0, startMinute: 540, endMinute: 630 },
        { classSectionId: fixtures.cls.id, dayOfWeek: 0, startMinute: 630, endMinute: 720 },
      ],
    })
    await expect(workshops.createWorkshop(workshopForm(fixtures.cls.id))).rejects.toThrow(
      'hosting%20block'
    )
  })
  it('allows a replacement slot after cancellation and protects published/completed work', async () => {
    const draft = await createDraft()
    for (const status of ['PUBLISHED', 'COMPLETED', 'CANCELLED'] as const) {
      await prisma.workshop.update({ where: { id: draft.id }, data: { status } })
      await expect(
        workshops.updateWorkshop(workshopForm(fixtures.cls.id, { id: draft.id, version: 0 }))
      ).rejects.toThrow('Only%20unstaffed%20draft')
    }
    await createDraft()
    expect(await prisma.workshop.count()).toBe(2)
  })
  it('rejects inactive or inconsistent school/teacher records', async () => {
    await prisma.school.update({
      where: { id: fixtures.school.id },
      data: { deletedAt: new Date() },
    })
    await expect(workshops.createWorkshop(workshopForm(fixtures.cls.id))).rejects.toThrow(
      'active%20class'
    )
    await prisma.school.update({ where: { id: fixtures.school.id }, data: { deletedAt: null } })
    await prisma.user.update({
      where: { id: fixtures.teacher.id },
      data: { deletedAt: new Date() },
    })
    await expect(workshops.createWorkshop(workshopForm(fixtures.cls.id))).rejects.toThrow(
      'active%20class'
    )
    await prisma.user.update({
      where: { id: fixtures.teacher.id },
      data: { deletedAt: null, schoolId: fixtures.otherSchool.id },
    })
    await expect(workshops.createWorkshop(workshopForm(fixtures.cls.id))).rejects.toThrow(
      'active%20class'
    )
    expect(await prisma.workshop.count()).toBe(0)
  })
  it('does not move a workshop when hosting blocks change', async () => {
    const draft = await createDraft()
    await classes.deleteMeeting(form({ id: fixtures.cls.meetings[0].id }))
    expect(
      (await prisma.workshop.findUniqueOrThrow({ where: { id: draft.id } })).scheduledStart
    ).toEqual(draft.scheduledStart)
  })
  it('serializes competing workshop creation so only one overlap can commit', async () => {
    await Promise.allSettled([
      workshops.createWorkshop(workshopForm(fixtures.cls.id)),
      workshops.createWorkshop(workshopForm(fixtures.sibling.id)),
    ])
    expect(await prisma.workshop.count()).toBe(1)
  })
  it('enforces duration and staffing bounds at the database boundary', async () => {
    const data = {
      classSectionId: fixtures.cls.id,
      scheduledStart: new Date('2027-01-04T18:00Z'),
      scheduledEnd: new Date('2027-01-04T17:00Z'),
    }
    await expect(prisma.workshop.create({ data })).rejects.toThrow()
    await expect(
      prisma.workshop.create({
        data: { ...data, scheduledEnd: new Date('2027-01-04T19:00Z'), minPAs: 3, maxPAs: 1 },
      })
    ).rejects.toThrow()
  })
})
