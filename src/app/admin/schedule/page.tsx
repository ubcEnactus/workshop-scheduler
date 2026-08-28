import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { findOpenCycle } from '@/lib/scheduling/cycle'
import { ScheduleReviewClient } from '@/components/admin/schedule-review'
import { runScheduleAction, confirmAllAction } from './actions'

export default async function AdminSchedulePage() {
  await requireRole('ADMIN')

  const cycle = await findOpenCycle()

  if (!cycle) {
    return (
      <div className="py-16 text-center">
        <p className="text-lg font-semibold text-gray-900">No open round</p>
        <p className="mt-2 text-sm text-gray-500">
          Open a scheduling round from the Rounds tab first, then come back here to run the
          scheduler.
        </p>
      </div>
    )
  }

  const [workshops, paCount, schoolCount] = await Promise.all([
    prisma.workshop.findMany({
      where: { cycleId: cycle.id },
      include: {
        classSection: {
          select: { name: true, subject: true, grade: true, school: { select: { name: true } } },
        },
        assignments: {
          include: { pa: { select: { id: true, name: true, email: true } } },
        },
      },
      orderBy: [{ scheduledStart: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    }),
    prisma.user.count({ where: { role: 'PA', deletedAt: null } }),
    prisma.school.count({ where: { deletedAt: null } }),
  ])

  const workshopData = workshops.map((ws) => ({
    id: ws.id,
    className: ws.classSection.name,
    schoolName: ws.classSection.school.name,
    grade: ws.classSection.grade,
    subject: ws.classSection.subject,
    scheduledStart: ws.scheduledStart?.toISOString() ?? null,
    scheduledEnd: ws.scheduledEnd?.toISOString() ?? null,
    status: ws.status,
    minPAs: ws.minPAs,
    assignments: ws.assignments.map((a) => ({
      paId: a.pa.id,
      paName: a.pa.name,
      paEmail: a.pa.email,
      status: a.status,
    })),
  }))

  const data = {
    cycleName: cycle.name,
    cycleId: cycle.id,
    workshopCount: workshops.filter((w) => w.status === 'UNSCHEDULED').length,
    paCount,
    schoolCount,
    classCount: workshops.length,
    minPAs: 3,
  }

  return (
    <ScheduleReviewClient
      data={data}
      workshops={workshopData}
      runSchedulerAction={runScheduleAction}
      confirmAllAction={confirmAllAction}
    />
  )
}
