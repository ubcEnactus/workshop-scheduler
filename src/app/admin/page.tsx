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

const SECTIONS = [
  {
    href: '/admin/staffing',
    name: 'Staffing settings',
    blurb: 'Set monthly PA quotas and the assignment gap.',
  },
  {
    href: '/admin/workshops',
    name: 'Workshop schedule',
    blurb: 'Create, staff, and publish dated workshops.',
  },
  { href: '/admin/schools', name: 'Schools', blurb: 'Manage partner schools and districts.' },
  { href: '/admin/pas', name: 'PAs', blurb: 'Manage PA access.' },
  {
    href: '/admin/classes',
    name: 'Classes & teachers',
    blurb: 'Reuse class details and manage teacher contacts.',
  },
] as const

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requireRole('ADMIN')
  const context = parseSchedulingContext(await searchParams)
  const now = new Date()

  const [schoolCount, teacherCount, paCount, classCount, upcomingWorkshops] = await Promise.all([
    prisma.school.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { role: 'TEACHER', deletedAt: null } }),
    prisma.user.count({ where: { role: 'PA', deletedAt: null } }),
    prisma.classSection.count({
      where: { school: { deletedAt: null }, teacher: { deletedAt: null } },
    }),
    prisma.workshop.findMany({
      where: {
        scheduledStart: { gte: now },
        status: { in: ['DRAFT', 'PUBLISHED'] },
        classSection: {
          school: { deletedAt: null },
          teacher: { deletedAt: null },
        },
      },
      include: { classSection: { include: { school: true } } },
      orderBy: { scheduledStart: 'asc' },
      take: 5,
    }),
  ])

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Admin dashboard"
        title={`Hello ${user.name ?? user.email}`}
        description="Book a workshop in one step. New schools, teachers and classes are saved as you go."
        actions={
          <Link href={schedulingHref('/admin/workshops/new', context)} className={buttonClasses()}>
            Book workshop
          </Link>
        }
      />

      <section
        className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4"
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
          label="Classes"
          value={classCount}
          detail="Saved for reuse"
          icon={<BookOpen className="size-5" />}
          tone="slate"
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)]">
        <Panel
          title="Upcoming workshops"
          description="The next scheduled workshops across all partner schools."
          actions={
            <Link
              href={schedulingHref('/admin/workshops', context)}
              className={buttonClasses({ variant: 'secondary', size: 'sm' })}
            >
              View schedule
            </Link>
          }
        >
          {upcomingWorkshops.length === 0 ? (
            <div className="empty-state">
              <CalendarDays className="size-6" aria-hidden="true" />
              <p>No upcoming workshops are scheduled.</p>
              <Link
                href={schedulingHref('/admin/workshops/new', context)}
                className={buttonClasses({ size: 'sm' })}
              >
                Book your first workshop
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
                      <th>Class</th>
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
                            {workshop.classSection.name}
                          </Link>
                        </td>
                        <td>{workshop.classSection.school.name}</td>
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
                href={schedulingHref(section.href, context)}
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
