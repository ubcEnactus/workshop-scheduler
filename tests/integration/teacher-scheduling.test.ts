import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, expect, it, vi } from 'vitest'
import { prisma } from '../../src/lib/db'
import { form, resetFixtures } from '../fixtures'

const { sessionAuth } = vi.hoisted(() => ({ sessionAuth: vi.fn() }))
vi.mock('next-auth', () => ({ default: () => ({ auth: sessionAuth }) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error('REDIRECT:' + url)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
import { createTeacher, updateTeacher } from '../../src/app/admin/teachers/actions'
import {
  createClassSection,
  deleteClassSection,
  updateClassLifecycle,
} from '../../src/app/admin/classes/actions'
import { saveRecurringClassAvailability } from '../../src/app/admin/classes/availability-actions'
import { createWorkshopBooking } from '../../src/app/admin/workshops/booking-actions'

let f: Awaited<ReturnType<typeof resetFixtures>>
beforeEach(async () => {
  f = await resetFixtures()
  sessionAuth.mockResolvedValue({ user: { id: f.admin.id } })
})
afterAll(() => prisma.$disconnect())

async function addTeacher() {
  await expect(
    createTeacher(
      form({
        name: 'New Teacher',
        email: 'new@fixture.local',
        schoolId: f.school.id,
        workshopDefinitionId: 'fixture-definition-1',
      })
    )
  ).rejects.toThrow(
    /\/admin\/teachers\/.*workshopDefinitionId=fixture-definition-1.*saved=created#availability/
  )
  return prisma.user.findUniqueOrThrow({
    where: { email: 'new@fixture.local' },
    include: { classesTaught: true },
  })
}

it('creates the teacher and implicit schedule atomically, with immediate availability editing', async () => {
  const teacher = await addTeacher()
  expect(teacher.classesTaught).toHaveLength(1)
  const profile = teacher.classesTaught[0]
  expect(profile).toMatchObject({
    name: teacher.name,
    teacherId: teacher.id,
    schoolId: teacher.schoolId,
  })
  expect(
    await saveRecurringClassAvailability(
      {},
      form({
        classSectionId: profile.id,
        days: 0,
        startTime: '09:00',
        endTime: '11:00',
        effectiveFrom: '2027-01-01',
        activeForScheduling: '1',
      })
    )
  ).toEqual({ saved: true })
  expect(await prisma.classMeeting.count({ where: { classSectionId: profile.id } })).toBe(1)
  await expect(
    createTeacher(form({ name: 'Duplicate', email: teacher.email, schoolId: f.school.id }))
  ).rejects.toThrow('email%20is%20already')
  expect(await prisma.classSection.count({ where: { teacherId: teacher.id } })).toBe(1)
})

it('rejects a duplicate profile in the database and reuses the profile from stale class actions', async () => {
  await expect(
    prisma.classSection.create({
      data: { name: 'Second class', teacherId: f.teacher.id, schoolId: f.school.id },
    })
  ).rejects.toMatchObject({ code: 'P2002' })
  await expect(
    createClassSection(form({ name: 'Second class', teacherId: f.teacher.id }))
  ).rejects.toThrow('/admin/classes/' + f.cls.id)
  expect(await prisma.classSection.count({ where: { teacherId: f.teacher.id } })).toBe(1)
  await expect(deleteClassSection(form({ id: f.cls.id }))).rejects.toThrow(
    'Deactivate%20the%20teacher'
  )
  expect(await prisma.classSection.findUnique({ where: { id: f.cls.id } })).not.toBeNull()
})

it('reuses teacher scheduling even when clients supply different labels and blocks a second delivery in the run', async () => {
  const teacher = await addTeacher()
  const input = (run: string, label: string) =>
    form({
      requestKey: randomUUID(),
      workshopDefinitionId: run,
      schoolChoice: f.school.id,
      teacherChoice: teacher.id,
      classChoice: '__new__',
      className: label,
      date: '2027-01-04',
      startTime: '10:00',
      endTime: '11:00',
      minPAs: 1,
      maxPAs: 3,
    })
  await expect(
    createWorkshopBooking({}, input('fixture-definition-1', 'First class'))
  ).rejects.toThrow('saved=1')
  expect(
    (await createWorkshopBooking({}, input('fixture-definition-1', 'Another class'))).error
  ).toMatch(/already|non-cancelled/i)
  await expect(
    createWorkshopBooking({}, input('fixture-definition-2', 'Another class'))
  ).rejects.toThrow('saved=1')
  expect(await prisma.classSection.count({ where: { teacherId: teacher.id } })).toBe(1)
  expect(await prisma.workshopSession.count()).toBe(2)
})

it('renames the teacher display without rewriting saved session host history', async () => {
  const teacher = await addTeacher()
  const profile = teacher.classesTaught[0]
  await expect(
    createWorkshopBooking(
      {},
      form({
        requestKey: randomUUID(),
        workshopDefinitionId: 'fixture-definition-1',
        schoolChoice: f.school.id,
        teacherChoice: teacher.id,
        classChoice: profile.id,
        date: '2027-01-04',
        startTime: '10:00',
        endTime: '11:00',
        minPAs: 1,
        maxPAs: 3,
      })
    )
  ).rejects.toThrow('saved=1')
  const before = await prisma.workshopSession.findFirstOrThrow()
  await expect(
    updateTeacher(
      form({ id: teacher.id, name: 'Renamed Teacher', email: teacher.email, schoolId: f.school.id })
    )
  ).rejects.toThrow('saved=teacher')
  expect((await prisma.classSection.findUniqueOrThrow({ where: { id: profile.id } })).name).toBe(
    'Renamed Teacher'
  )
  const after = await prisma.workshopSession.findFirstOrThrow()
  expect(after).toEqual(before)
})

it('allows a school change for an empty profile and keeps its teacher and school consistent', async () => {
  const teacher = await addTeacher()
  await expect(
    updateTeacher(
      form({
        id: teacher.id,
        name: teacher.name!,
        email: teacher.email,
        schoolId: f.otherSchool.id,
      })
    )
  ).rejects.toThrow('saved=teacher')
  expect(
    (await prisma.classSection.findUniqueOrThrow({ where: { teacherId: teacher.id } })).schoolId
  ).toBe(f.otherSchool.id)
})

it('archives and reactivates the same profile without creating another one', async () => {
  const teacher = await addTeacher()
  let profile = teacher.classesTaught[0]
  await expect(
    updateClassLifecycle(
      form({
        id: profile.id,
        action: 'ARCHIVE',
        expectedUpdatedAt: profile.updatedAt.toISOString(),
      })
    )
  ).rejects.toThrow('saved=lifecycle')
  profile = await prisma.classSection.findUniqueOrThrow({ where: { id: profile.id } })
  expect(profile.archivedAt).not.toBeNull()
  await expect(
    updateClassLifecycle(
      form({
        id: profile.id,
        action: 'REACTIVATE',
        expectedUpdatedAt: profile.updatedAt.toISOString(),
      })
    )
  ).rejects.toThrow('saved=lifecycle')
  expect(
    (await prisma.classSection.findUniqueOrThrow({ where: { teacherId: teacher.id } })).archivedAt
  ).toBeNull()
})
