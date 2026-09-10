import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { FormError } from '@/components/form-error'
import { WorkshopForm } from '@/components/workshop-form'
import { monthSchema } from '@/lib/schemas/workshops'
import {
  formatInstantRange,
  shiftMonth,
  vancouverDateKey,
  vancouverMonthBounds,
  vancouverMonthKey,
} from '@/lib/time'
import { createWorkshop } from './actions'
import { loadSchedule } from '@/lib/scheduling/store'
import { staffingProblems } from '@/lib/scheduling/eligibility'
import { AlertTriangle, CalendarDays, Settings2, Sparkles } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { StatCard } from '@/components/ui/stat-card'
import { StatusBadge } from '@/components/ui/status-badge'
import { buttonClasses } from '@/components/ui/button'

function dateTile(date: Date) {
  const [year, month, day] = vancouverDateKey(date).split('-').map(Number)
  return {
    month: new Intl.DateTimeFormat('en-CA', { month: 'short', timeZone: 'UTC' }).format(
      new Date(Date.UTC(year, month - 1, day))
    ),
    day,
  }
}

export default async function WorkshopsPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string
    schoolId?: string
    classSectionId?: string
    error?: string
  }>
}) {
  await requireRole('ADMIN')
  const query = await searchParams
  const parsed = monthSchema.safeParse(query.month ?? vancouverMonthKey())
  const month = parsed.success ? parsed.data : vancouverMonthKey()
  const { start, end } = vancouverMonthBounds(month)
  const [workshops, classes, schools] = await Promise.all([
    prisma.workshop.findMany({
      where: {
        scheduledStart: { gte: start, lt: end },
        ...(query.classSectionId ? { classSectionId: query.classSectionId } : {}),
        classSection: {
          ...(query.schoolId ? { schoolId: query.schoolId } : {}),
          school: { deletedAt: null },
          teacher: { deletedAt: null },
        },
      },
      include: {
        classSection: { include: { school: true } },
        _count: { select: { assignments: true } },
      },
      orderBy: [{ scheduledStart: 'asc' }, { id: 'asc' }],
    }),
    prisma.classSection.findMany({
      where: { school: { deletedAt: null }, teacher: { deletedAt: null, role: 'TEACHER' } },
      include: {
        school: true,
        teacher: true,
        meetings: { orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.school.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } }),
  ])
  const monthHref = (value: string) =>
    `/admin/workshops?${new URLSearchParams({ month: value, ...(query.schoolId ? { schoolId: query.schoolId } : {}), ...(query.classSectionId ? { classSectionId: query.classSectionId } : {}) })}`
  const snapshot = await loadSchedule(prisma)
  const drafts = workshops.filter((workshop) => workshop.status === 'DRAFT').length
  const published = workshops.filter((workshop) => workshop.status === 'PUBLISHED').length
  const needsReview = workshops.filter(
    (workshop) =>
      workshop.status === 'PUBLISHED' &&
      workshop.scheduledEnd.getTime() >= Date.now() &&
      snapshot.workshops.some(
        (item) => item.id === workshop.id && staffingProblems(snapshot, item).length > 0
      )
  ).length
  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Schedule workspace"
        title="Workshops"
        description={`Plan and staff dated workshops for ${month}. Drafts remain private until you publish them.`}
        actions={
          <>
            <Link href={'/admin/workshops/plan?month=' + month} className={buttonClasses()}>
              <CalendarDays className="size-4" /> Plan monthly workshops
            </Link>
            <Link
              href={'/admin/workshops/match?month=' + month}
              className={buttonClasses({ variant: 'secondary' })}
            >
              <Sparkles className="size-4" /> Assign PAs automatically
            </Link>
          </>
        }
      >
        <Link href="/admin" className="text-sm font-medium text-slate-500 hover:text-slate-900">
          ← Admin home
        </Link>
      </PageHeader>
      <FormError
        message={
          query.error ??
          (!parsed.success ? 'Invalid month. Showing the current Vancouver month.' : undefined)
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Workshops"
          value={workshops.length}
          detail={`${month} total`}
          icon={<CalendarDays className="size-5" />}
          tone="blue"
        />
        <StatCard
          label="Drafts"
          value={drafts}
          detail="Private planning work"
          icon={<Settings2 className="size-5" />}
          tone="slate"
        />
        <StatCard
          label={needsReview ? 'Needs review' : 'Published'}
          value={needsReview || published}
          detail={needsReview ? `${published} published in total` : 'Official assignments'}
          icon={
            needsReview ? <AlertTriangle className="size-5" /> : <Sparkles className="size-5" />
          }
          tone={needsReview ? 'amber' : 'green'}
        />
      </div>
      <Panel
        title="Month and filters"
        description="Focus the workspace without changing the underlying schedule."
      >
        <form method="get" className="form-grid items-end lg:grid-cols-[1fr_1fr_1fr_auto]">
          <div className="field">
            <label htmlFor="month">Month</label>
            <input
              id="month"
              name="month"
              type="month"
              defaultValue={month}
              required
              className="input"
            />
          </div>
          <div className="field">
            <label htmlFor="school">School filter</label>
            <select
              id="school"
              name="schoolId"
              defaultValue={query.schoolId ?? ''}
              className="input"
            >
              <option value="">All schools</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="class-filter">Class filter</label>
            <select
              id="class-filter"
              name="classSectionId"
              defaultValue={query.classSectionId ?? ''}
              className="input"
            >
              <option value="">All classes</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
          </div>
          <button className={buttonClasses({ variant: 'secondary' })} type="submit">
            Show month
          </button>
        </form>
        <nav
          aria-label="Month navigation"
          className="mt-5 flex items-center justify-between gap-4 border-t border-slate-100 pt-4 text-sm"
        >
          <Link
            href={monthHref(shiftMonth(month, -1))}
            className="font-medium text-slate-500 hover:text-slate-900"
          >
            Previous month
          </Link>
          <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
            {month} · Vancouver
          </span>
          <Link
            href={monthHref(shiftMonth(month, 1))}
            className="font-medium text-slate-500 hover:text-slate-900"
          >
            Next month
          </Link>
        </nav>
      </Panel>
      <Panel
        title="Monthly schedule"
        description={`${workshops.length} workshop${workshops.length === 1 ? '' : 's'} in the current view.`}
        actions={
          <Link
            href={'/admin/staffing?month=' + month}
            className={buttonClasses({ variant: 'ghost', size: 'sm' })}
          >
            <Settings2 className="size-4" /> PA quotas and assignment gap
          </Link>
        }
      >
        {workshops.length === 0 ? (
          <div className="empty-state">
            <CalendarDays className="mx-auto size-9 text-slate-300" />
            <p className="mt-3 font-semibold text-slate-800">
              No workshops in this month for these filters.
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Plan the month or adjust the filters above.
            </p>
          </div>
        ) : (
          <>
            <p className="mb-3 text-xs text-slate-500 sm:hidden">
              Swipe horizontally to review every schedule column.
            </p>
            <div
              className="table-scroll"
              role="region"
              aria-label="Scrollable workshop schedule"
              tabIndex={0}
            >
              <table className="data-table">
                <caption className="sr-only">Workshops for {month}, America/Vancouver</caption>
                <thead>
                  <tr>
                    {[
                      'Class',
                      'School',
                      'Vancouver date/time',
                      'Staffing',
                      'Status',
                      'Editing',
                      'Lock',
                      'Review',
                    ].map((label) => (
                      <th key={label} scope="col">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {workshops.map((workshop) => (
                    <tr key={workshop.id}>
                      <td>
                        <Link
                          href={`/admin/workshops/${workshop.id}`}
                          className="font-semibold text-slate-900 hover:text-[#1e2a4a] hover:underline"
                        >
                          {workshop.classSection.name}
                        </Link>
                      </td>
                      <td className="text-slate-500">{workshop.classSection.school.name}</td>
                      <td className="min-w-64">
                        <div className="flex items-center gap-3">
                          <span className="flex size-12 shrink-0 flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50 leading-none">
                            <span className="text-[10px] font-bold tracking-wide text-slate-500 uppercase">
                              {dateTile(workshop.scheduledStart).month}
                            </span>
                            <span className="mt-1 text-base font-bold text-slate-900">
                              {dateTile(workshop.scheduledStart).day}
                            </span>
                          </span>
                          <span className="text-sm font-medium text-slate-700">
                            {formatInstantRange(workshop.scheduledStart, workshop.scheduledEnd)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="font-semibold text-slate-900">
                          {workshop._count.assignments}
                        </span>{' '}
                        <span className="text-slate-500">
                          / {workshop.minPAs}–{workshop.maxPAs} PAs
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={workshop.status} />
                      </td>
                      <td>
                        <span className="text-xs font-medium text-slate-500">
                          {workshop.status === 'DRAFT' && workshop._count.assignments === 0
                            ? 'Editable'
                            : 'Protected'}
                        </span>
                      </td>
                      <td>
                        <StatusBadge
                          status={
                            workshop.locked || workshop.status !== 'DRAFT' ? 'LOCKED' : 'UNLOCKED'
                          }
                        />
                      </td>
                      <td>
                        {workshop.status === 'PUBLISHED' &&
                        workshop.scheduledEnd.getTime() >= Date.now() &&
                        snapshot.workshops.some(
                          (w) => w.id === workshop.id && staffingProblems(snapshot, w).length > 0
                        ) ? (
                          <Link
                            href={`/admin/workshops/${workshop.id}`}
                            className="font-semibold text-amber-700 hover:underline"
                          >
                            Needs review
                          </Link>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
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
        title="Create workshop"
        description="Add an ad hoc dated workshop to the current month."
        className="max-w-3xl"
      >
        <WorkshopForm action={createWorkshop} classes={classes} month={month} />
      </Panel>
    </main>
  )
}
