import { AlertCircle, CalendarCheck2, CalendarDays, School, Users } from 'lucide-react'

import { PublishedWorkshops } from '@/components/published-workshops'
import { HistoryPagination } from '@/components/history-pagination'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { StatCard } from '@/components/ui/stat-card'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { visibleWorkshop } from '@/lib/scheduling/visibility'
import { participantChangeSummary } from '@/lib/scheduling/participant-change-summary'
import { vancouverMonthBounds, vancouverMonthKey } from '@/lib/time'

const PAGE_SIZE = 20

function pageNumber(value: string | undefined) {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? Math.min(page, 10_000) : 1
}

export default async function TeacherHome({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requireRole('TEACHER')
  const query = await searchParams
  const upcomingPage = pageNumber(query.upcomingPage)
  const historyPage = pageNumber(query.historyPage)
  const now = new Date()
  const currentMonth = vancouverMonthKey(now)
  const monthBounds = vancouverMonthBounds(currentMonth)
  const school = user.schoolId
    ? await prisma.school.findFirst({
        where: { id: user.schoolId, deletedAt: null },
        select: { name: true },
      })
    : null
  const participantSelect = {
    id: true,
    hostClassName: true,
    mode: true,
    location: true,
    participantInstructions: true,
    scheduledStart: true,
    scheduledEnd: true,
    status: true,
    classWorkshop: {
      select: {
        workshopDefinition: { select: { title: true } },
        classSection: { select: { name: true } },
      },
    },
    assignments: {
      where: { status: 'PUBLISHED' as const, pa: { deletedAt: null, role: 'PA' as const } },
      select: { pa: { select: { id: true, name: true, email: true } } },
    },
    events: {
      where: { wasPublished: true, kind: { notIn: ['PUBLISH', 'INTERNAL_EDIT'] } },
      select: { id: true, kind: true, before: true, after: true },
      orderBy: { createdAt: 'desc' as const },
      take: 1,
    },
  }
  const schoolSession = user.schoolId
    ? { classWorkshop: { classSection: { schoolId: user.schoolId } } }
    : { id: { in: [] as string[] } }
  const [
    upcomingRows,
    historyRows,
    upcomingCount,
    thisMonthCount,
    completedCount,
    facilitatorCount,
  ] = school
    ? await Promise.all([
        prisma.workshopSession.findMany({
          where: {
            ...schoolSession,
            status: 'PUBLISHED',
            scheduledEnd: { gte: now },
          },
          select: participantSelect,
          orderBy: [{ scheduledStart: 'asc' }, { id: 'asc' }],
          skip: (upcomingPage - 1) * PAGE_SIZE,
          take: PAGE_SIZE + 1,
        }),
        prisma.workshopSession.findMany({
          where: {
            AND: [
              visibleWorkshop,
              schoolSession,
              {
                OR: [
                  { status: 'PUBLISHED', scheduledEnd: { lt: now } },
                  { status: { in: ['CANCELLED', 'COMPLETED'] }, publishedAt: { not: null } },
                ],
              },
            ],
          },
          select: participantSelect,
          orderBy: [{ scheduledStart: 'desc' }, { id: 'desc' }],
          skip: (historyPage - 1) * PAGE_SIZE,
          take: PAGE_SIZE + 1,
        }),
        prisma.workshopSession.count({
          where: { ...schoolSession, status: 'PUBLISHED', scheduledEnd: { gte: now } },
        }),
        prisma.workshopSession.count({
          where: {
            AND: [
              visibleWorkshop,
              schoolSession,
              { scheduledStart: { gte: monthBounds.start, lt: monthBounds.end } },
            ],
          },
        }),
        prisma.workshopSession.count({
          where: { ...schoolSession, status: 'COMPLETED', publishedAt: { not: null } },
        }),
        prisma.user.count({
          where: {
            role: 'PA',
            deletedAt: null,
            assignments: {
              some: {
                status: 'PUBLISHED',
                workshopSession: { AND: [visibleWorkshop, schoolSession] },
              },
            },
          },
        }),
      ])
    : [[], [], 0, 0, 0, 0]
  const upcoming = upcomingRows.slice(0, PAGE_SIZE)
  const history = historyRows.slice(0, PAGE_SIZE)
  const workshops = [...upcoming, ...history]

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Teacher dashboard"
        title={`Hello ${user.name ?? user.email}`}
        description="See published workshops for your school, including assigned program assistants and schedule changes."
      />

      {!school ? (
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
              value={upcomingCount}
              detail="Published workshops"
              icon={<CalendarDays />}
              tone="blue"
            />
            <StatCard
              label="This month"
              value={thisMonthCount}
              detail="Published and past"
              icon={<CalendarCheck2 />}
              tone="amber"
            />
            <StatCard
              label="Completed"
              value={completedCount}
              detail="Workshop history"
              icon={<CalendarCheck2 />}
              tone="green"
            />
            <StatCard
              label="Facilitators"
              value={facilitatorCount}
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
                  {school?.name ?? 'Your assigned school'}
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Admins manage teacher times, workshop dates, facilitators, and all schedule
                  changes.
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
          name: workshop.hostClassName ?? workshop.classWorkshop.classSection.name,
          definitionTitle: workshop.classWorkshop.workshopDefinition.title,
          mode: workshop.mode,
          location: workshop.location,
          participantInstructions: workshop.participantInstructions,
          start: workshop.scheduledStart,
          end: workshop.scheduledEnd,
          status: workshop.status,
          pas: workshop.assignments
            .map((assignment) => assignment.pa.name ?? assignment.pa.email)
            .join(', '),
          reason: workshop.events[0] ? participantChangeSummary(workshop.events[0]) : undefined,
        }))}
        upcomingFooter={
          <HistoryPagination
            path="/teacher"
            query={query}
            parameter="upcomingPage"
            page={upcomingPage}
            hasNext={upcomingRows.length > PAGE_SIZE}
            noun="workshops"
          />
        }
        historyFooter={
          <HistoryPagination
            path="/teacher"
            query={query}
            parameter="historyPage"
            page={historyPage}
            hasNext={historyRows.length > PAGE_SIZE}
          />
        }
      />
    </main>
  )
}
