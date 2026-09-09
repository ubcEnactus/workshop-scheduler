import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { clockMinutes, type WorkshopInput } from '@/lib/schemas/workshops'
import { vancouverToUtc } from '@/lib/time'
import type { ScheduleSnapshot } from './eligibility'

export class SchedulingError extends Error {}
// Called only by Server Actions (and their server helpers). Every staffing,
// availability and workshop mutation takes the same row lock before reading
// eligibility. ReadCommitted ensures a waiter sees the preceding commit.
export function scheduleTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(
    async (tx) => {
      await tx.schedulingSettings.update({ where: { id: 1 }, data: { revision: { increment: 1 } } })
      return work(tx)
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 15_000,
      timeout: 20_000,
    }
  )
}
export async function loadSchedule(db: Prisma.TransactionClient): Promise<ScheduleSnapshot> {
  const [settings, pas, availability, quotas, workshops] = await Promise.all([
    db.schedulingSettings.findUniqueOrThrow({ where: { id: 1 } }),
    db.user.findMany({
      where: { role: 'PA', deletedAt: null },
      select: { id: true, name: true, email: true },
      orderBy: { id: 'asc' },
    }),
    db.availability.findMany({
      orderBy: [{ userId: 'asc' }, { dayOfWeek: 'asc' }, { startMin: 'asc' }],
    }),
    db.monthlyPAQuota.findMany({ orderBy: [{ paId: 'asc' }, { month: 'asc' }] }),
    db.workshop.findMany({
      include: {
        assignments: { orderBy: { paId: 'asc' } },
        classSection: { include: { teacher: true, school: true } },
      },
      orderBy: { id: 'asc' },
    }),
  ])
  return {
    minimumGapMinutes: settings.minimumGapMinutes,
    pas,
    availability,
    quotas,
    workshops: workshops.map((w) => ({
      id: w.id,
      classSectionId: w.classSectionId,
      scheduledStart: w.scheduledStart,
      scheduledEnd: w.scheduledEnd,
      minPAs: w.minPAs,
      maxPAs: w.maxPAs,
      status: w.status,
      version: w.version,
      locked: w.locked,
      activeClass:
        w.classSection.teacher.deletedAt === null &&
        w.classSection.teacher.role === 'TEACHER' &&
        w.classSection.school.deletedAt === null &&
        w.classSection.teacher.schoolId === w.classSection.schoolId,
      assignments: w.assignments.map((a) => ({ paId: a.paId, status: a.status, source: a.source })),
    })),
  }
}
export async function validateSlot(
  tx: Prisma.TransactionClient,
  data: WorkshopInput,
  excludeId?: string
) {
  const cls = await tx.classSection.findFirst({
    where: {
      id: data.classSectionId,
      teacher: { role: 'TEACHER', deletedAt: null },
      school: { deletedAt: null },
    },
    include: { meetings: true, teacher: { select: { schoolId: true } } },
  })
  if (!cls || cls.teacher.schoolId !== cls.schoolId)
    throw new SchedulingError('Select an active class with a teacher at its school.')
  const startMinute = clockMinutes(data.startTime),
    endMinute = clockMinutes(data.endTime)
  const dayOfWeek = new Date(data.date + 'T12:00:00Z').getUTCDay() - 1
  if (
    !cls.meetings.some(
      (block) =>
        block.dayOfWeek === dayOfWeek &&
        block.startMinute <= startMinute &&
        block.endMinute >= endMinute
    )
  )
    throw new SchedulingError('The full workshop must fit inside one class hosting block.')
  const scheduledStart = vancouverToUtc(data.date, startMinute),
    scheduledEnd = vancouverToUtc(data.date, endMinute)
  const conflict = await tx.workshop.findFirst({
    where: {
      ...(excludeId ? { id: { not: excludeId } } : {}),
      status: { not: 'CANCELLED' },
      scheduledStart: { lt: scheduledEnd },
      scheduledEnd: { gt: scheduledStart },
      OR: [{ classSectionId: cls.id }, { classSection: { teacherId: cls.teacherId } }],
    },
    select: { id: true },
  })
  if (conflict)
    throw new SchedulingError('This class or teacher already has an overlapping workshop.')
  return {
    classSectionId: cls.id,
    scheduledStart,
    scheduledEnd,
    minPAs: data.minPAs,
    maxPAs: data.maxPAs,
  }
}
