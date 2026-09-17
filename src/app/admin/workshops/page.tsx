import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { FormError } from '@/components/form-error'
import { ScheduleToolbar } from '@/components/schedule-toolbar'
import { WorkspaceSchedule, type WorkspaceRow } from '@/components/workspace-schedule'
import {
  normalizeSchedulingContext,
  schedulingHref,
  type SchedulingContext,
} from '@/lib/scheduling/navigation'
import { formatInstantRange, vancouverMonthBounds } from '@/lib/time'
import { loadSchedule } from '@/lib/scheduling/store'
import { eligibility, staffingProblems, workload } from '@/lib/scheduling/eligibility'
import { scheduleHash } from '@/lib/scheduling/matching-preview'
import { matchesScheduleView } from '@/lib/scheduling/workspace'
import { PageHeader } from '@/components/ui/page-header'
import { buttonClasses } from '@/components/ui/button'

export default async function WorkshopsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requireRole('ADMIN')
  const query = await searchParams
  const [allClasses, schools, snapshot] = await Promise.all([
    prisma.classSection.findMany({
      where: { school: { deletedAt: null }, teacher: { role: 'TEACHER', deletedAt: null } },
      include: {
        school: true,
        teacher: true,
        meetings: { orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.school.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } }),
    loadSchedule(prisma),
  ])
  const classes = allClasses.filter((c) => c.teacher.schoolId === c.schoolId)
  const { context, warning } = normalizeSchedulingContext(query, classes, schools)
  const { start, end } = vancouverMonthBounds(context.month)
  const workshops = snapshot.workshops
    .filter(
      (w) =>
        w.activeClass &&
        classes.some((c) => c.id === w.classSectionId) &&
        w.scheduledStart >= start &&
        w.scheduledStart < end &&
        (!context.schoolId || w.schoolId === context.schoolId) &&
        (!context.classSectionId || w.classSectionId === context.classSectionId)
    )
    .sort(
      (a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime() || a.id.localeCompare(b.id)
    )
  const rows: WorkspaceRow[] = workshops.map((w) => {
    const cls = classes.find((c) => c.id === w.classSectionId)!
    return {
      id: w.id,
      version: w.version,
      name: cls.name,
      school: cls.school.name,
      date: formatInstantRange(w.scheduledStart, w.scheduledEnd),
      status: w.status,
      locked: w.locked,
      minPAs: w.minPAs,
      maxPAs: w.maxPAs,
      visible: matchesScheduleView(w, snapshot, context.view),
      problems: staffingProblems(snapshot, w),
      assignments: w.assignments.map((a) => ({
        id: a.paId,
        name:
          snapshot.pas.find((p) => p.id === a.paId)?.name ??
          snapshot.pas.find((p) => p.id === a.paId)?.email ??
          'Inactive PA',
      })),
      candidates: snapshot.pas
        .filter((p) => !w.assignments.some((a) => a.paId === p.id))
        .map((p) => {
          const quota = snapshot.quotas.find((q) => q.paId === p.id && q.month === context.month)
          return {
            id: p.id,
            name: p.name ?? p.email,
            reasons: eligibility(snapshot, w, p.id),
            remaining: quota
              ? Math.max(0, quota.quota - workload(snapshot, p.id, context.month))
              : null,
          }
        }),
    }
  })
  const views: { view: SchedulingContext['view']; label: string }[] = [
    { view: 'all', label: 'All' },
    { view: 'draft', label: 'Drafts' },
    { view: 'unstaffed', label: 'Needs staffing' },
    { view: 'ready', label: 'Ready to publish' },
    { view: 'published', label: 'Published' },
    { view: 'review', label: 'Needs review' },
  ]
  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Schedule workspace"
        title="Workshops"
        description={'Plan, staff and publish workshops for ' + context.month + '.'}
        actions={
          <>
            <Link
              href={schedulingHref('/admin/workshops/new', context)}
              className={buttonClasses()}
            >
              Book workshop
            </Link>
            <Link
              href={schedulingHref('/admin/workshops/plan', context)}
              className={buttonClasses({ variant: 'secondary' })}
            >
              Plan monthly workshops
            </Link>
            <Link
              href={schedulingHref('/admin/workshops/match', context)}
              className={buttonClasses({ variant: 'secondary' })}
            >
              Assign PAs automatically
            </Link>
          </>
        }
      />
      <FormError message={query.error ?? warning} />
      <ScheduleToolbar context={context} schools={schools} classes={classes} />
      <nav aria-label="Schedule views" className="flex flex-wrap gap-2">
        {views.map((v) => (
          <Link
            key={v.view}
            scroll={false}
            aria-current={(context.view ?? 'all') === v.view ? 'page' : undefined}
            href={schedulingHref('/admin/workshops', { ...context, view: v.view })}
            className={
              'rounded-full border px-3 py-2 text-xs font-semibold ' +
              ((context.view ?? 'all') === v.view
                ? 'border-slate-800 bg-slate-800 text-white'
                : 'border-slate-200 bg-white text-slate-700')
            }
          >
            {v.label} · {workshops.filter((w) => matchesScheduleView(w, snapshot, v.view)).length}
          </Link>
        ))}
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-slate-600">Select drafts to review publication together.</p>
        <Link className="font-semibold underline" href={schedulingHref('/admin/staffing', context)}>
          PA quotas and assignment gap
        </Link>
      </div>
      <WorkspaceSchedule
        key={JSON.stringify(context)}
        rows={rows}
        context={context}
        inputHash={scheduleHash(snapshot)}
      />
    </main>
  )
}
