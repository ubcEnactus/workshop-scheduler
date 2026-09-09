import { prisma } from '../src/lib/db'

export function assertTestDatabase() {
  const value = process.env.TEST_DATABASE_URL
  if (!value || process.env.DATABASE_URL !== value || process.env.DIRECT_URL !== value)
    throw new Error('Use the isolated test runner.')
  const url = new URL(value)
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/workshop_test')
    throw new Error('Refusing to reset a non-test database.')
}

export async function resetFixtures() {
  assertTestDatabase()
  await prisma.$transaction([
    prisma.monthlyPAQuota.deleteMany(),
    prisma.schedulingSettings.update({
      where: { id: 1 },
      data: { minimumGapMinutes: null, revision: 0 },
    }),
    prisma.verificationToken.deleteMany(),
    prisma.session.deleteMany(),
    prisma.account.deleteMany(),
    prisma.assignment.deleteMany(),
    prisma.workshop.deleteMany(),
    prisma.classMeeting.deleteMany(),
    prisma.availability.deleteMany(),
    prisma.classSection.deleteMany(),
    prisma.user.deleteMany(),
    prisma.school.deleteMany(),
  ])
  const school = await prisma.school.create({
    data: { name: 'Fixture School', district: 'Vancouver' },
  })
  const otherSchool = await prisma.school.create({
    data: { name: 'Other School', district: 'Burnaby' },
  })
  const admin = await prisma.user.create({
    data: { email: 'admin@fixture.local', name: 'Fixture Admin', role: 'ADMIN' },
  })
  const pa = await prisma.user.create({
    data: { email: 'pa@fixture.local', name: 'Fixture PA', role: 'PA' },
  })
  const teacher = await prisma.user.create({
    data: {
      email: 'teacher@fixture.local',
      name: 'Fixture Teacher',
      role: 'TEACHER',
      schoolId: school.id,
    },
  })
  const otherTeacher = await prisma.user.create({
    data: {
      email: 'other@fixture.local',
      name: 'Other Teacher',
      role: 'TEACHER',
      schoolId: otherSchool.id,
    },
  })
  const deleted = await prisma.user.create({
    data: { email: 'deleted@fixture.local', role: 'PA', deletedAt: new Date() },
  })
  const cls = await prisma.classSection.create({
    data: {
      name: 'Fixture Biology',
      teacherId: teacher.id,
      schoolId: school.id,
      meetings: {
        create: [
          { dayOfWeek: 0, startMinute: 540, endMinute: 720 },
          { dayOfWeek: 1, startMinute: 540, endMinute: 720 },
        ],
      },
    },
    include: { meetings: true },
  })
  const sibling = await prisma.classSection.create({
    data: {
      name: 'Fixture Chemistry',
      teacherId: teacher.id,
      schoolId: school.id,
      meetings: { create: { dayOfWeek: 0, startMinute: 540, endMinute: 720 } },
    },
  })
  return { school, otherSchool, admin, pa, teacher, otherTeacher, deleted, cls, sibling }
}

export function form(values: Record<string, string | number>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, String(value))
  return data
}

export function workshopForm(
  classSectionId: string,
  overrides: Record<string, string | number> = {}
) {
  return form({
    classSectionId,
    month: '2027-01',
    date: '2027-01-04',
    startTime: '10:00',
    endTime: '11:00',
    minPAs: 1,
    maxPAs: 3,
    ...overrides,
  })
}
