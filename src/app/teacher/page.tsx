import { AlertCircle, CalendarCheck2, CalendarDays, School, Users } from 'lucide-react'

import { PublishedWorkshops } from '@/components/published-workshops'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { StatCard } from '@/components/ui/stat-card'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { visibleWorkshop } from '@/lib/scheduling/visibility'
import { vancouverMonthKey } from '@/lib/time'

export default async function TeacherHome() {
  const user = await requireRole('TEACHER')

  const workshops = user.schoolId
    ? await prisma.workshop.findMany({
        where: { AND: [visibleWorkshop, { classSection: { schoolId: user.schoolId } }] },
        include: {
          classSection: { select: { name: true, school: { select: { name: true } } } },
          assignments: {
            where: { status: 'PUBLISHED', pa: { deletedAt: null, role: 'PA' } },
            include: { pa: { select: { id: true, name: true, email: true } } },
          },
          events: { where: { kind: { not: 'PUBLISH' } }, orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: { scheduledStart: 'asc' },
      })
    : []
  const school = user.schoolId
    ? await prisma.school.findFirst({
        where: { id: user.schoolId, deletedAt: null },
        select: { name: true },
      })
    : null

  const now = Date.now()
  const currentMonth = vancouverMonthKey()
  const upcoming = workshops.filter(
    (workshop) => workshop.status === 'PUBLISHED' && workshop.scheduledEnd.getTime() >= now
  )
  const thisMonth = workshops.filter(
    (workshop) => vancouverMonthKey(workshop.scheduledStart) === currentMonth
  )
  const completed = workshops.filter((workshop) => workshop.status === 'COMPLETED')
  const facilitators = new Set(
    workshops.flatMap((workshop) => workshop.assignments.map((assignment) => assignment.pa.id))
  )
  const schoolName = school?.name ?? workshops[0]?.classSection.school.name

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Teacher dashboard"
        title={`Hello ${user.name ?? user.email}`}
        description="See published workshops for your school, including assigned program assistants and schedule changes."
      />

      {!user.schoolId ? (
        <Panel>
          <div role="alert" className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <AlertCircle className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-semibold text-slate-900">School connection needed</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Your account is not linked to a school yet. Ask an admin to update it so published
                workshops appear here.
              </p>
            </div>
          </div>
        </Panel>
      ) : (
        <>
          <section
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
            aria-label="Workshop summary"
          >
            <StatCard
              label="Upcoming"
              value={upcoming.length}
              detail="Published workshops"
              icon={<CalendarDays />}
              tone="blue"
            />
            <StatCard
              label="This month"
              value={thisMonth.length}
              detail="Published and past"
              icon={<CalendarCheck2 />}
              tone="amber"
            />
            <StatCard
              label="Completed"
              value={completed.length}
              detail="Workshop history"
              icon={<CalendarCheck2 />}
              tone="green"
            />
            <StatCard
              label="Facilitators"
              value={facilitators.size}
              detail="Across your schedule"
              icon={<Users />}
              tone="slate"
            />
          </section>

          <Panel title="Your school" description="This account has view-only schedule access.">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[#1e2a4a]">
                <School className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold text-slate-900">
                  {schoolName ?? 'Your assigned school'}
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Admins manage class times, workshop dates, facilitators, and all schedule changes.
                </p>
              </div>
            </div>
          </Panel>
        </>
      )}

      <PublishedWorkshops
        upcomingTitle="Upcoming workshops at your school"
        empty="No published workshops are currently scheduled."
        items={workshops.map((workshop) => ({
          id: workshop.id,
          name: workshop.classSection.name,
          start: workshop.scheduledStart,
          end: workshop.scheduledEnd,
          status: workshop.status,
          pas: workshop.assignments
            .map((assignment) => assignment.pa.name ?? assignment.pa.email)
            .join(', '),
          reason: workshop.events[0]?.reason,
        }))}
      />
    </main>
  )
}
