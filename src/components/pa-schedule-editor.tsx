import { AvailabilityGrid } from '@/components/availability-grid'
import { prisma } from '@/lib/db'
import {
  vancouverDateKey,
  vancouverMonthKey,
  vancouverMonthBounds,
  isCalendarDate,
  formatInstantRange,
} from '@/lib/time'
import { saveAvailabilityForm } from '@/app/pa/availability/actions'
import { PAAvailabilityCalendar } from '@/components/pa-availability-calendar'
import { paCalendarWindows } from '@/lib/pa-calendar'
import {
  savePAAvailability,
  savePAException,
  removePAException,
} from '@/app/admin/pas/availability-actions'
import { availabilityRevision } from '@/lib/availability'
import { visibleWorkshop } from '@/lib/scheduling/visibility'

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

export async function PAScheduleEditor({
  userId,
  basePath,
  admin = false,
  query,
}: {
  userId: string
  basePath: string
  admin?: boolean
  query: { saved?: string; error?: string; effectiveFrom?: string; month?: string }
}) {
  const { saved, error } = query
  const revision = await availabilityRevision(prisma, userId)
  const today = vancouverDateKey(new Date())
  const month =
    query.month && isCalendarDate(query.month + '-01') ? query.month : vancouverMonthKey()
  const bounds = vancouverMonthBounds(month)
  const [rows, exceptions, calendarSlots, assignments] = await Promise.all([
    prisma.availability.findMany({
      where: {
        userId: userId,
        effectiveFrom: { lte: new Date(today + 'T00:00:00Z') },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: new Date(today + 'T00:00:00Z') } }],
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startMin: 'asc' }],
      select: { dayOfWeek: true, startMin: true },
    }),
    prisma.pAAvailabilityException.findMany({
      where: { userId: userId },
      orderBy: [{ date: 'asc' }, { startMinute: 'asc' }],
      select: {
        id: true,
        date: true,
        kind: true,
        startMinute: true,
        endMinute: true,
        notes: true,
      },
    }),
    prisma.availability.findMany({
      where: { userId },
      select: {
        userId: true,
        dayOfWeek: true,
        startMin: true,
        effectiveFrom: true,
        effectiveUntil: true,
      },
    }),
    prisma.assignment.findMany({
      where: {
        paId: userId,
        status: 'PUBLISHED',
        workshopSession: {
          status: { in: ['PUBLISHED', 'COMPLETED'] },
          AND: [visibleWorkshop],
          scheduledStart: { gte: bounds.start, lt: bounds.end },
          classWorkshop: { classSection: { school: { deletedAt: null } } },
        },
      },
      select: {
        workshopSession: {
          select: {
            id: true,
            scheduledStart: true,
            scheduledEnd: true,
            status: true,
            hostSchoolName: true,
            classWorkshop: {
              select: {
                workshopDefinition: { select: { title: true } },
                classSection: { select: { school: { select: { name: true } } } },
              },
            },
          },
        },
      },
      orderBy: { workshopSession: { scheduledStart: 'asc' } },
    }),
  ])
  const count = new Date(`${month}-01T12:00:00Z`)
  count.setUTCMonth(count.getUTCMonth() + 1, 0)
  const calendarDays = Array.from({ length: count.getUTCDate() }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, '0')}`
    return {
      date,
      windows: paCalendarWindows(
        userId,
        date,
        calendarSlots,
        exceptions.map((item) => ({ ...item, userId }))
      ),
      changes: admin
        ? exceptions
            .filter((item) => dateKey(item.date) === date)
            .map((item) => ({
              id: item.id,
              kind: item.kind,
              startMinute: item.startMinute,
              endMinute: item.endMinute,
              notes: item.notes,
            }))
        : [],
      weeklyWindows: admin
        ? paCalendarWindows(
            userId,
            date,
            calendarSlots,
            exceptions
              .filter((item) => item.kind === 'UNAVAILABLE')
              .map((item) => ({ ...item, userId }))
          )
        : undefined,
      sessions: assignments.flatMap(({ workshopSession: session }) =>
        vancouverDateKey(session.scheduledStart) === date
          ? [
              {
                id: session.id,
                title: session.classWorkshop.workshopDefinition.title,
                time: formatInstantRange(session.scheduledStart, session.scheduledEnd),
                school: session.hostSchoolName ?? session.classWorkshop.classSection.school.name,
                completed: session.status === 'COMPLETED',
              },
            ]
          : []
      ),
    }
  })

  return (
    <div className="space-y-6">
      <AvailabilityGrid
        admin={admin}
        key={`${today}:${rows.map((row) => `${row.dayOfWeek}-${row.startMin}`).join(',')}`}
        checked={new Set(rows.map((row) => `${row.dayOfWeek}-${row.startMin}`))}
        action={admin ? savePAAvailability.bind(null, userId, revision) : saveAvailabilityForm}
        expectedRevision={revision}
        saved={saved === '1'}
        error={error === '1'}
      />
      <PAAvailabilityCalendar
        key={month}
        month={month}
        today={today}
        days={calendarDays}
        basePath={basePath}
        exceptionAction={admin ? savePAException.bind(null, userId, revision) : undefined}
        removeExceptionAction={admin ? removePAException.bind(null, userId, revision) : undefined}
      />
    </div>
  )
}
