import { prisma } from '../src/lib/db'
import type { Prisma } from '@prisma/client'
import { vancouverToUtc } from '../src/lib/time'
import { assessAssignment, assignmentPolicyHash } from '../src/lib/scheduling/eligibility'
import { loadSchedule } from '../src/lib/scheduling/store'

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
    prisma.publicationReceipt.deleteMany(),
    prisma.matchingPreview.deleteMany(),
    prisma.enrollmentBatch.deleteMany(),
    prisma.monthlyPAQuota.deleteMany(),
    prisma.schedulingSettings.update({
      where: { id: 1 },
      data: { minimumGapDays: null, revision: 0 },
    }),
    prisma.verificationToken.deleteMany(),
    prisma.session.deleteMany(),
    prisma.account.deleteMany(),
    prisma.assignment.deleteMany(),
    prisma.workshopSession.deleteMany(),
    prisma.availabilitySlot.deleteMany(),
    prisma.classWorkshop.deleteMany(),
    prisma.workshopDefinition.deleteMany(),
    prisma.workshopBatch.deleteMany(),
    prisma.classAvailabilityException.deleteMany(),
    prisma.schoolClosure.deleteMany(),
    prisma.pAAvailabilityException.deleteMany(),
    prisma.classMeeting.deleteMany(),
    prisma.availability.deleteMany(),
    prisma.availabilityScheduleVersion.deleteMany(),
    prisma.classSection.deleteMany(),
    prisma.user.deleteMany(),
    prisma.school.deleteMany(),
  ])
  await prisma.workshopDefinition.createMany({
    data: Array.from({ length: 20 }, (_, i) => ({
      id: `fixture-definition-${i + 1}`,
      number: i + 1,
      title: `Workshop ${i + 1}`,
      durationMinutes: 60,
    })),
  })
  const school = await prisma.school.create({
    data: { name: 'Fixture School' },
  })
  const otherSchool = await prisma.school.create({
    data: { name: 'Other School' },
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
          {
            dayOfWeek: 0,
            startMinute: 540,
            endMinute: 720,
            activeForScheduling: true,
          },
          {
            dayOfWeek: 1,
            startMinute: 540,
            endMinute: 720,
            activeForScheduling: true,
          },
        ],
      },
    },
    include: { meetings: true },
  })
  const siblingTeacher = await prisma.user.create({
    data: {
      email: 'sibling@fixture.local',
      name: 'Sibling Teacher',
      role: 'TEACHER',
      schoolId: school.id,
    },
  })
  const sibling = await prisma.classSection.create({
    data: {
      name: 'Fixture Chemistry',
      teacherId: siblingTeacher.id,
      schoolId: school.id,
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
  return {
    school,
    otherSchool,
    admin,
    pa,
    teacher,
    otherTeacher,
    deleted,
    cls,
    sibling,
    siblingTeacher,
  }
}

// Existing staffing scenarios need a dated session with explicit host availability.
// Give each fixture its own curriculum identity unless the test supplies a join.
export async function createSessionFixture({
  data,
}: {
  data: Omit<Prisma.WorkshopSessionUncheckedCreateInput, 'classWorkshopId'> & {
    classSectionId: string
  }
}) {
  const { classSectionId, ...session } = data
  const cw = await prisma.classWorkshop.create({
    data: {
      classSection: { connect: { id: classSectionId } },
      workshopDefinition: { create: { title: 'Fixture workshop' } },
      availabilitySlots: { create: { start: data.scheduledStart, end: data.scheduledEnd } },
    },
  })
  return prisma.workshopSession.create({ data: { ...session, classWorkshopId: cw.id } })
}

export async function addCandidateFixture(
  classSectionId: string,
  date: string,
  definitionId = 'fixture-definition-1',
  startMinute = 600,
  endMinute = 660
) {
  const cw = await prisma.classWorkshop.upsert({
    where: {
      classSectionId_workshopDefinitionId: { classSectionId, workshopDefinitionId: definitionId },
    },
    create: { classSectionId, workshopDefinitionId: definitionId },
    update: {},
  })
  const start = vancouverToUtc(date, startMinute),
    end = vancouverToUtc(date, endMinute)
  const slot = await prisma.availabilitySlot.upsert({
    where: { classWorkshopId_start_end: { classWorkshopId: cw.id, start, end } },
    create: { classWorkshopId: cw.id, start, end },
    update: {},
  })
  return {
    classWorkshopId: cw.id,
    slotId: slot.id,
    expectedUpdatedAt: slot.updatedAt.toISOString(),
  }
}
export async function addSessionCandidateFixture(
  sessionId: string,
  date: string,
  startMinute = 600,
  endMinute = 660
) {
  const session = await prisma.workshopSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { classWorkshop: true },
  })
  return addCandidateFixture(
    session.classWorkshop.classSectionId,
    date,
    session.classWorkshop.workshopDefinitionId,
    startMinute,
    endMinute
  )
}

export function form(values: Record<string, string | number>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, String(value))
  return data
}

export async function staffingForm(
  workshopSessionId: string,
  version: number,
  paId: string,
  overrides: Record<string, string | number> = {}
) {
  const snapshot = await loadSchedule(prisma, {
    kind: 'sessions',
    workshopSessionIds: [workshopSessionId],
  })
  const workshop = snapshot.workshops.find((item) => item.id === workshopSessionId)
  if (!workshop) throw new Error('Workshop fixture was not loaded.')
  const assessment = assessAssignment(snapshot, workshop, paId)
  return form({
    id: workshopSessionId,
    version,
    paId,
    expectedPolicyHash: assignmentPolicyHash(workshop, paId, assessment),
    ...overrides,
  })
}

export function workshopForm(
  classSectionId: string,
  overrides: Record<string, string | number> = {}
) {
  return form({
    classSectionId,
    workshopDefinitionId: 'fixture-definition-1',
    month: '2027-01',
    date: '2027-01-04',
    startTime: '10:00',
    endTime: '11:00',
    minPAs: 1,
    maxPAs: 3,
    ...overrides,
  })
}
