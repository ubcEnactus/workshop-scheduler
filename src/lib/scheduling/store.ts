import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { clockMinutes, type WorkshopInput } from '@/lib/schemas/workshops'
import { vancouverDateKey, vancouverMonthBounds, vancouverToUtc } from '@/lib/time'
import type { ScheduleSnapshot } from './eligibility'
import { withinDeliveryWindow } from './delivery-windows'
import { generateClassCandidates } from './recurring-candidates'

const hostInclude = {
  workshopDefinition: true,
  availabilitySlots: true,
  classSection: {
    include: {
      teacher: true,
      school: { include: { closures: true } },
      availabilitySlots: true,
      meetings: { include: { skips: true } },
      availabilityExceptions: true,
    },
  },
} satisfies Prisma.ClassWorkshopInclude
type SessionHost = Prisma.ClassWorkshopGetPayload<{ include: typeof hostInclude }>

const scheduleSessionInclude = {
  assignments: { orderBy: { paId: 'asc' as const } },
  classWorkshop: { include: hostInclude },
} satisfies Prisma.WorkshopSessionInclude
type LoadedScheduleSession = Prisma.WorkshopSessionGetPayload<{
  include: typeof scheduleSessionInclude
}>

export type ScheduleNeighborhood = { start: Date; end: Date }
type ScopeNeighborhoods = { neighborhoods?: readonly ScheduleNeighborhood[] }
export type ScheduleLoadScope =
  | ({
      kind: 'month'
      month: string
      classSectionIds?: readonly string[]
    } & ScopeNeighborhoods)
  | ({ kind: 'run'; workshopDefinitionId: string } & ScopeNeighborhoods)
  | ({ kind: 'sessions'; workshopSessionIds: readonly string[] } & ScopeNeighborhoods)
  | ({ kind: 'pa'; paId: string; start: Date; end: Date } & ScopeNeighborhoods)

const POLICY_NEIGHBORHOOD_MS = 7 * 24 * 60 * 60 * 1000

function expandedNeighborhood(start: Date, end: Date): ScheduleNeighborhood {
  return {
    start: new Date(start.getTime() - POLICY_NEIGHBORHOOD_MS),
    end: new Date(end.getTime() + POLICY_NEIGHBORHOOD_MS),
  }
}

function mergeNeighborhoods(items: readonly ScheduleNeighborhood[]) {
  const sorted = items
    .filter((item) => item.start < item.end)
    .map((item) => ({ start: new Date(item.start), end: new Date(item.end) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime())
  const merged: ScheduleNeighborhood[] = []
  for (const item of sorted) {
    const previous = merged.at(-1)
    if (previous && item.start <= previous.end) {
      if (item.end > previous.end) previous.end = item.end
    } else merged.push(item)
  }
  return merged
}

export function sessionAvailability(host: SessionHost, start: Date, end: Date) {
  const date = vancouverDateKey(start)
  const cls = host.classSection
  return generateClassCandidates({
    windowStart: date,
    windowEnd: date,
    durationMinutes: (end.getTime() - start.getTime()) / 60_000,
    incrementMinutes: 1,
    maxCandidates: 1440,
    recurring: cls.meetings.map((rule) => ({
      ...rule,
      active: rule.activeForScheduling,
      skippedDates: rule.skips.map((skip) => skip.date.toISOString().slice(0, 10)),
      effectiveFrom: rule.effectiveFrom.toISOString().slice(0, 10),
      effectiveUntil: rule.effectiveUntil?.toISOString().slice(0, 10),
    })),
    exceptions: [
      ...cls.availabilityExceptions.map((exception) => ({
        ...exception,
        date: exception.date.toISOString().slice(0, 10),
      })),
      ...cls.school.closures.map((closure) => ({
        ...closure,
        date: closure.date.toISOString().slice(0, 10),
        kind: 'CLOSED' as const,
      })),
    ],
    explicit: [...host.availabilitySlots, ...cls.availabilitySlots],
  }).find(
    (candidate) =>
      candidate.start.getTime() === start.getTime() && candidate.end.getTime() === end.getTime()
  )
}

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
export async function loadSchedule(
  db: Prisma.TransactionClient,
  scope?: ScheduleLoadScope
): Promise<ScheduleSnapshot> {
  let targetWhere: Prisma.WorkshopSessionWhereInput = {}
  const requestedNeighborhoods = [...(scope?.neighborhoods ?? [])]
  if (scope?.kind === 'month') {
    const bounds = vancouverMonthBounds(scope.month)
    targetWhere = {
      scheduledStart: { gte: bounds.start, lt: bounds.end },
      ...(scope.classSectionIds?.length
        ? { classWorkshop: { classSectionId: { in: [...scope.classSectionIds] } } }
        : {}),
    }
    requestedNeighborhoods.push(bounds)
  } else if (scope?.kind === 'run') {
    targetWhere = { classWorkshop: { workshopDefinitionId: scope.workshopDefinitionId } }
  } else if (scope?.kind === 'sessions') {
    targetWhere = { id: { in: [...scope.workshopSessionIds] } }
  } else if (scope?.kind === 'pa') {
    targetWhere = {
      status: { not: 'CANCELLED' },
      scheduledStart: { lt: scope.end },
      scheduledEnd: { gt: scope.start },
      assignments: { some: { paId: scope.paId } },
    }
    requestedNeighborhoods.push({ start: scope.start, end: scope.end })
  }

  const [
    settings,
    pas,
    availability,
    availabilityExceptions,
    targets,
    assignmentCounts,
    runWindow,
  ] = await Promise.all([
    db.schedulingSettings.findUniqueOrThrow({ where: { id: 1 } }),
    db.user.findMany({
      where: { role: 'PA', deletedAt: null },
      select: { id: true, name: true, email: true },
      orderBy: { id: 'asc' },
    }),
    db.availability.findMany({
      where: { user: { role: 'PA', deletedAt: null } },
      orderBy: [
        { userId: 'asc' },
        { dayOfWeek: 'asc' },
        { startMin: 'asc' },
        { effectiveFrom: 'asc' },
        { id: 'asc' },
      ],
    }),
    db.pAAvailabilityException.findMany({
      where: { user: { role: 'PA', deletedAt: null } },
      orderBy: [{ userId: 'asc' }, { date: 'asc' }, { id: 'asc' }],
    }),
    db.workshopSession.findMany({
      where: targetWhere,
      include: scheduleSessionInclude,
      orderBy: { id: 'asc' },
    }),
    db.assignment.groupBy({
      by: ['paId'],
      where: {
        pa: { role: 'PA', deletedAt: null },
        workshopSession: { status: { not: 'CANCELLED' } },
      },
      _count: { _all: true },
    }),
    scope?.kind === 'run'
      ? db.workshopDefinition.findUnique({
          where: { id: scope.workshopDefinitionId },
          select: { deliveryStartsOn: true, deliveryEndsOn: true },
        })
      : Promise.resolve(null),
  ])

  if (runWindow?.deliveryStartsOn && runWindow.deliveryEndsOn) {
    const dayAfterEnd = new Date(runWindow.deliveryEndsOn)
    dayAfterEnd.setUTCDate(dayAfterEnd.getUTCDate() + 1)
    requestedNeighborhoods.push({
      start: vancouverToUtc(runWindow.deliveryStartsOn.toISOString().slice(0, 10), 0),
      end: vancouverToUtc(dayAfterEnd.toISOString().slice(0, 10), 0),
    })
  }

  const neighborhoods = scope
    ? mergeNeighborhoods([
        ...requestedNeighborhoods.map(({ start, end }) => expandedNeighborhood(start, end)),
        ...targets
          .filter((workshop) => workshop.status !== 'CANCELLED')
          .map((workshop) => expandedNeighborhood(workshop.scheduledStart, workshop.scheduledEnd)),
      ])
    : []
  const nearby =
    scope && neighborhoods.length
      ? await db.workshopSession.findMany({
          where: {
            ...(targets.length ? { id: { notIn: targets.map((workshop) => workshop.id) } } : {}),
            status: { not: 'CANCELLED' },
            OR: neighborhoods.map(({ start, end }) => ({
              scheduledStart: { lt: end },
              scheduledEnd: { gt: start },
            })),
          },
          include: scheduleSessionInclude,
          orderBy: { id: 'asc' },
        })
      : []
  const workshops: LoadedScheduleSession[] = scope
    ? [
        ...new Map([...targets, ...nearby].map((workshop) => [workshop.id, workshop])).values(),
      ].sort((a, b) => a.id.localeCompare(b.id))
    : targets
  const assignmentTotals = Object.fromEntries(
    assignmentCounts.map((count) => [count.paId, count._count._all])
  )
  const effectiveTeachers = await db.user.findMany({
    where: {
      id: {
        in: [...new Set(workshops.map((w) => w.classWorkshop.classSection.teacherId))],
      },
      role: 'TEACHER',
      deletedAt: null,
    },
    select: { id: true, schoolId: true },
  })
  const baselineAssignmentKeys = workshops
    .filter((workshop) => workshop.status !== 'CANCELLED')
    .flatMap((workshop) =>
      workshop.assignments.map((assignment) => `${workshop.id}:${assignment.paId}`)
    )
  return {
    minimumGapDays: settings.minimumGapDays,
    pas,
    availability,
    quotas: [],
    availabilityExceptions,
    assignmentTotals,
    baselineAssignmentKeys,
    workshops: workshops.map((w) => ({
      id: w.id,
      classSectionId: w.classWorkshop.classSectionId,
      workshopDefinitionId: w.classWorkshop.workshopDefinitionId,
      definitionTitle: w.classWorkshop.workshopDefinition.title,
      schoolId: w.classWorkshop.classSection.schoolId,
      schoolName: w.hostSchoolName ?? w.classWorkshop.classSection.school.name,
      mode: w.mode,
      location: w.location,
      notes: w.notes,
      participantInstructions: w.participantInstructions,
      dateExceptionReason: w.dateExceptionReason,
      dateExceptionApproved: Boolean(w.dateExceptionReason && w.dateExceptionApprovedBy),
      scheduledStart: w.scheduledStart,
      scheduledEnd: w.scheduledEnd,
      minPAs: w.minPAs,
      maxPAs: w.maxPAs,
      status: w.status,
      version: w.version,
      locked: w.locked,
      hostingValid:
        Boolean(w.dateExceptionReason && w.dateExceptionApprovedBy) ||
        (withinDeliveryWindow(
          w.classWorkshop.workshopDefinition,
          w.scheduledStart,
          w.scheduledEnd
        ) &&
          Boolean(sessionAvailability(w.classWorkshop, w.scheduledStart, w.scheduledEnd))),
      activeClass:
        w.classWorkshop.classSection.archivedAt === null &&
        w.classWorkshop.status !== 'WAIVED' &&
        w.classWorkshop.classSection.school.deletedAt === null &&
        effectiveTeachers.some(
          (teacher) =>
            teacher.id === w.classWorkshop.classSection.teacherId &&
            teacher.schoolId === w.classWorkshop.classSection.schoolId
        ),
      assignments: w.assignments.map((a) => ({
        paId: a.paId,
        status: a.status,
        source: a.source,
        overrideAvailability: a.overrideAvailability,
        overrideSameDay: a.overrideSameDay,
        overrideWeek: a.overrideWeek,
        overrideReason: a.overrideReason,
      })),
    })),
  }
}
export async function validateSlot(
  tx: Prisma.TransactionClient,
  data: Pick<
    WorkshopInput,
    | 'classSectionId'
    | 'workshopDefinitionId'
    | 'date'
    | 'startTime'
    | 'endTime'
    | 'minPAs'
    | 'maxPAs'
  >,
  excludeId?: string,
  options?: { hostingConfirmed?: true; dateExceptionReason?: string; actorId?: string }
) {
  const cls = await tx.classSection.findFirst({
    where: {
      id: data.classSectionId,
      archivedAt: null,
      school: { deletedAt: null },
    },
    include: { availabilitySlots: true },
  })
  if (!cls) throw new SchedulingError('Select an active teacher at the selected school.')
  const teacher = await tx.user.findFirst({
    where: {
      id: cls.teacherId,
      role: 'TEACHER',
      deletedAt: null,
      schoolId: cls.schoolId,
    },
  })
  if (!teacher) throw new SchedulingError('Select an active teacher at this school.')
  const startMinute = clockMinutes(data.startTime),
    endMinute = clockMinutes(data.endTime)
  const scheduledStart = vancouverToUtc(data.date, startMinute),
    scheduledEnd = vancouverToUtc(data.date, endMinute)
  const classWorkshop = await tx.classWorkshop.findUnique({
    where: {
      classSectionId_workshopDefinitionId: {
        classSectionId: cls.id,
        workshopDefinitionId: data.workshopDefinitionId,
      },
    },
    include: {
      ...hostInclude,
      sessions: {
        where: { status: { not: 'CANCELLED' }, ...(excludeId ? { id: { not: excludeId } } : {}) },
      },
    },
  })
  if (!classWorkshop) throw new SchedulingError('Enroll this teacher in the workshop run first.')
  if (classWorkshop.status === 'WAIVED')
    throw new SchedulingError('Restore this teacher enrollment before scheduling it.')
  if (classWorkshop.sessions.length)
    throw new SchedulingError('This teacher workshop already has a scheduled or completed session.')
  const existing = excludeId
    ? await tx.workshopSession.findUnique({ where: { id: excludeId } })
    : null
  const unchanged =
    existing?.classWorkshopId === classWorkshop.id &&
    existing.scheduledStart.getTime() === scheduledStart.getTime() &&
    existing.scheduledEnd.getTime() === scheduledEnd.getTime()
  const newException = Boolean(options?.dateExceptionReason?.trim() && options.actorId)
  const preservedException = Boolean(
    unchanged && existing?.dateExceptionReason && existing.dateExceptionApprovedBy
  )
  const hasException = newException || preservedException
  if (
    !hasException &&
    !withinDeliveryWindow(classWorkshop.workshopDefinition, scheduledStart, scheduledEnd)
  )
    throw new SchedulingError('Choose a date within this workshop’s shared delivery window.')
  const authorization = sessionAvailability(classWorkshop, scheduledStart, scheduledEnd)
  if (!hasException && !authorization)
    throw new SchedulingError(
      'The full session must fit an availability window for this teacher workshop.'
    )
  return {
    classWorkshopId: classWorkshop.id,
    scheduledStart,
    scheduledEnd,
    minPAs: data.minPAs,
    maxPAs: data.maxPAs,
    hostTeacherName:
      unchanged && existing?.hostTeacherName
        ? existing.hostTeacherName
        : (teacher.name ?? teacher.email),
    hostClassName:
      unchanged && existing?.hostClassName
        ? existing.hostClassName
        : classWorkshop.classSection.name,
    hostSchoolName:
      unchanged && existing?.hostSchoolName
        ? existing.hostSchoolName
        : classWorkshop.classSection.school.name,
    dateExceptionReason: newException
      ? options!.dateExceptionReason!.trim()
      : preservedException
        ? existing!.dateExceptionReason
        : null,
    dateExceptionApprovedBy: newException
      ? options!.actorId!
      : preservedException
        ? existing!.dateExceptionApprovedBy
        : null,
    dateExceptionApprovedAt: newException
      ? new Date()
      : preservedException
        ? existing!.dateExceptionApprovedAt
        : null,
    availabilityBasis: authorization?.authorization ?? Prisma.DbNull,
    hostingConfirmed:
      options?.hostingConfirmed === true ||
      (existing?.classWorkshopId === classWorkshop.id && existing.hostingConfirmed),
  }
}
