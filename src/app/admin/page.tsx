import Link from 'next/link'
import { parseSchedulingContext, schedulingHref } from '@/lib/scheduling/navigation'
import { BookOpen, CalendarDays, School, Users } from 'lucide-react'

import { buttonClasses } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { StatCard } from '@/components/ui/stat-card'
import { StatusBadge } from '@/components/ui/status-badge'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { formatInstantRange } from '@/lib/time'
import { needsCommunication } from '@/lib/scheduling/communication'
import { FormError } from '@/components/form-error'

const SECTIONS = [
  {
    href: '/admin/workshop-definitions',
    name: 'Workshops',
    blurb: 'Set shared windows, add teachers, choose dates, and follow each delivery.',
  },
  {
    href: '/admin/workshops',
    name: 'Calendar',
    blurb: 'Review dated teacher sessions across workshops.',
  },
  {
    href: '/admin/classes',
    name: 'Schools & teachers',
    blurb: 'Manage partner schools, teachers, and availability.',
  },
  { href: '/admin/pas', name: 'PAs', blurb: 'Manage PA accounts, availability, and workload.' },
] as const

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requireRole('ADMIN')
  const query = await searchParams
  const context = parseSchedulingContext(query)
  const globalCalendarContext = {
    ...context,
    workshopDefinitionId: undefined,
    batch: undefined,
    week: undefined,
  }
  const now = new Date()

  const [
    schoolCount,
    teacherCount,
    paCount,
    classCount,
    runCount,
    notCompletedCount,
    upcomingWorkshops,
    communicationEvents,
    awaitingCompletion,
  ] = await Promise.all([
    prisma.school.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { role: 'TEACHER', deletedAt: null } }),
    prisma.user.count({ where: { role: 'PA', deletedAt: null } }),
    prisma.classSection.count({
      where: { archivedAt: null, school: { deletedAt: null } },
    }),
    prisma.workshopDefinition.count(),
    prisma.classWorkshop.count({ where: { status: { notIn: ['COMPLETED', 'WAIVED'] } } }),
    prisma.workshopSession.findMany({
      where: {
        scheduledStart: { gte: now },
        status: { in: ['DRAFT', 'PUBLISHED'] },
        classWorkshop: {
          classSection: {
            school: { deletedAt: null },
          },
        },
      },
      include: {
        classWorkshop: {
          include: { workshopDefinition: true, classSection: { include: { school: true } } },
        },
      },
      orderBy: { scheduledStart: 'asc' },
      take: 5,
    }),
    prisma.workshopEvent.findMany({
      where: {
        wasPublished: true,
        communicatedAt: null,
        kind: { notIn: ['COMPLETE', 'INTERNAL_EDIT'] },
      },
      include: {
        workshopSession: {
          select: {
            hostClassName: true,
            classWorkshop: {
              select: {
                classSection: { select: { name: true } },
                workshopDefinition: { select: { title: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.workshopSession.findMany({
      where: { status: 'PUBLISHED', scheduledEnd: { lt: now } },
      include: {
        classWorkshop: {
          select: {
            classSection: { select: { name: true } },
            workshopDefinition: { select: { title: true } },
          },
        },
      },
      orderBy: { scheduledEnd: 'desc' },
      take: 20,
    }),
  ])
  const communicationTasks = communicationEvents.filter(needsCommunication)

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Admin dashboard"
        title={`Hello ${user.name ?? user.email}`}
        description="Create a workshop, add its teachers, choose one date per teacher, then assign PAs and publish."
        actions={
          <>
            <Link
              href="/admin/workshop-definitions?create=1#create-workshop"
              className={buttonClasses()}
            >
              Create a workshop
            </Link>
            <Link
              href={schedulingHref('/admin/workshops/new', context)}
              className={buttonClasses({ variant: 'secondary' })}
            >
              Schedule a confirmed teacher session
            </Link>
          </>
        }
      />
      <FormError message={query.error} />

      <section
        className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-6"
        aria-label="Program summary"
      >
        <StatCard
          label="Schools"
          value={schoolCount}
          detail="Active partners"
          icon={<School className="size-5" />}
          tone="amber"
        />
        <StatCard
          label="Teachers"
          value={teacherCount}
          detail="Active accounts"
          icon={<Users className="size-5" />}
          tone="blue"
        />
        <StatCard
          label="PAs"
          value={paCount}
          detail="Active accounts"
          icon={<Users className="size-5" />}
          tone="green"
        />
        <StatCard
          label="Teachers"
          value={classCount}
          detail="Saved for reuse"
          icon={<BookOpen className="size-5" />}
          tone="slate"
        />
        <StatCard
          label="Workshops"
          value={runCount}
          detail="Named delivery windows"
          icon={<BookOpen className="size-5" />}
          tone="blue"
        />
        <StatCard
          label="Not completed"
          value={notCompletedCount}
          detail="Included teacher deliveries"
          icon={<CalendarDays className="size-5" />}
          tone="amber"
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2" aria-label="Follow-through">
        <Panel
          title="Communication needed"
          description="Recent published changes awaiting external coordination. No emails are sent by publishing."
        >
          {communicationTasks.length === 0 ? (
            <p className="text-sm text-slate-500">No outstanding communication tasks.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {communicationTasks.map((event) => (
                <li key={event.id} className="py-3">
                  <Link
                    className="text-sm font-semibold text-slate-900 underline"
                    href={`/admin/workshops/${event.workshopSessionId}#history`}
                  >
                    {event.workshopSession.classWorkshop.workshopDefinition.title} ·{' '}
                    {event.workshopSession.hostClassName ??
                      event.workshopSession.classWorkshop.classSection.name}
                  </Link>
                  <p className="mt-1 text-xs text-slate-500">
                    {event.kind.toLowerCase()} ·{' '}
                    {formatInstantRange(event.createdAt, event.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel
          title="Awaiting completion"
          description="Past published sessions remain open until an admin records completion."
        >
          {awaitingCompletion.length === 0 ? (
            <p className="text-sm text-slate-500">No past sessions need completion.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {awaitingCompletion.map((session) => (
                <li key={session.id} className="py-3">
                  <Link
                    className="text-sm font-semibold text-slate-900 underline"
                    href={`/admin/workshops/${session.id}`}
                  >
                    {session.classWorkshop.workshopDefinition.title} ·{' '}
                    {session.hostClassName ?? session.classWorkshop.classSection.name}
                  </Link>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatInstantRange(session.scheduledStart, session.scheduledEnd)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)]">
        <Panel
          title="Upcoming teacher sessions"
          description="The next dated teacher visits across all workshops and partner schools."
          actions={
            <Link
              href={schedulingHref('/admin/workshops', globalCalendarContext)}
              className={buttonClasses({ variant: 'secondary', size: 'sm' })}
            >
              View calendar
            </Link>
          }
        >
          {upcomingWorkshops.length === 0 ? (
            <div className="empty-state">
              <CalendarDays className="size-6" aria-hidden="true" />
              <p>No upcoming teacher sessions are scheduled.</p>
              <Link
                href="/admin/workshop-definitions?create=1#create-workshop"
                className={buttonClasses({ size: 'sm' })}
              >
                Create a workshop
              </Link>
            </div>
          ) : (
            <>
              <p className="mb-3 text-xs font-medium text-slate-500 sm:hidden">
                Scroll sideways to view all columns and actions.
              </p>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Teacher</th>
                      <th>School</th>
                      <th>Date and time</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingWorkshops.map((workshop) => (
                      <tr key={workshop.id}>
                        <td>
                          <Link
                            href={schedulingHref('/admin/workshops/' + workshop.id, context)}
                            className="font-semibold text-slate-900 hover:text-[#1e2a4a] hover:underline"
                          >
                            {workshop.classWorkshop.classSection.name}
                          </Link>
                        </td>
                        <td>{workshop.classWorkshop.classSection.school.name}</td>
                        <td>
                          {formatInstantRange(workshop.scheduledStart, workshop.scheduledEnd)}
                        </td>
                        <td>
                          <StatusBadge status={workshop.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>

        <Panel
          title="Manage your program"
          description="Keep the core records behind the schedule up to date."
        >
          <nav className="divide-y divide-slate-100" aria-label="Admin management">
            {SECTIONS.map((section) => (
              <Link
                key={section.href}
                href={schedulingHref(
                  section.href,
                  section.href === '/admin/workshops' ? globalCalendarContext : context
                )}
                className="group flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <span>
                  <span className="block text-sm font-semibold text-slate-900 group-hover:text-[#1e2a4a]">
                    {section.name}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                    {section.blurb}
                  </span>
                </span>
                <span className="text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-amber-600">
                  →
                </span>
              </Link>
            ))}
          </nav>
        </Panel>
      </section>
    </main>
  )
}
