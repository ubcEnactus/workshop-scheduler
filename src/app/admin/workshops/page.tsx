import Link from 'next/link'
import { notFound } from 'next/navigation'
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
import {
  formatInstantRange,
  vancouverDateKey,
  vancouverMinuteOfDay,
  vancouverMonthBounds,
} from '@/lib/time'
import { loadSchedule } from '@/lib/scheduling/store'
import {
  assessAssignment,
  assignmentPolicyHash,
  staffingProblems,
} from '@/lib/scheduling/eligibility'
import { scheduleHash } from '@/lib/scheduling/matching-preview'
import { matchesScheduleView } from '@/lib/scheduling/workspace'
import { PageHeader } from '@/components/ui/page-header'
import { buttonClasses } from '@/components/ui/button'
import { deliveryWindowLabel } from '@/lib/scheduling/delivery-windows'
import { ClearSavedPlanningChoices } from '@/components/clear-saved-planning-choices'
import { workshopRecordReference } from '@/app/admin/workshop-definitions/workshop-reference'

export default async function WorkshopsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const actor = await requireRole('ADMIN')
  const query = await searchParams
  const [allClasses, schools] = await Promise.all([
    prisma.classSection.findMany({
      where: { school: { deletedAt: null } },
      include: {
        school: true,
        teacher: true,
        meetings: { orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.school.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } }),
  ])
  const classes = allClasses
  const { context, warning } = normalizeSchedulingContext(query, classes, schools)
  const workshop = context.workshopDefinitionId
    ? await prisma.workshopDefinition.findUnique({ where: { id: context.workshopDefinitionId } })
    : null
  if (context.workshopDefinitionId && !workshop) notFound()
  const batchSessions =
    context.batch && workshop
      ? await prisma.workshopSession.findMany({
          where: { batchId: context.batch, classWorkshop: { workshopDefinitionId: workshop.id } },
          select: {
            id: true,
            classWorkshopId: true,
            scheduledStart: true,
            status: true,
            assignments: { select: { id: true } },
          },
        })
      : null
  const snapshot = await loadSchedule(
    prisma,
    workshop
      ? { kind: 'run', workshopDefinitionId: workshop.id }
      : {
          kind: 'month',
          month: context.month,
          classSectionIds: context.classSectionId ? [context.classSectionId] : undefined,
        }
  )
  const { start, end } = vancouverMonthBounds(context.month)
  const workshops = snapshot.workshops
    .filter(
      (w) =>
        w.activeClass &&
        classes.some((c) => c.id === w.classSectionId) &&
        (workshop
          ? w.workshopDefinitionId === workshop.id
          : w.scheduledStart >= start && w.scheduledStart < end) &&
        (!batchSessions || batchSessions.some((session) => session.id === w.id)) &&
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
      definitionTitle: w.definitionTitle,
      workshopDefinitionId: w.workshopDefinitionId,
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
        availabilityWarnings: assessAssignment(snapshot, w, a.paId).availabilityWarnings,
        warnings: assessAssignment(snapshot, w, a.paId).manualWarnings.map(({ code, message }) => ({
          code,
          message,
        })),
        name:
          snapshot.pas.find((p) => p.id === a.paId)?.name ??
          snapshot.pas.find((p) => p.id === a.paId)?.email ??
          'Inactive PA',
      })),
      candidates: snapshot.pas
        .filter((p) => !w.assignments.some((a) => a.paId === p.id))
        .map((p) => {
          const assessment = assessAssignment(snapshot, w, p.id)
          return {
            id: p.id,
            name: p.name ?? p.email,
            hardErrors: assessment.hardErrors,
            availabilityWarnings: assessment.availabilityWarnings,
            warnings: assessment.manualWarnings.map((warning) => ({
              code: warning.code,
              message: warning.message,
              commitments: warning.commitments.map(
                (item) =>
                  `${item.schoolName ?? 'School'} · ${formatInstantRange(item.scheduledStart, item.scheduledEnd)} · ${item.minutesBetween} minutes between sessions`
              ),
            })),
            totalAssignments: assessment.totalAssignments,
            expectedPolicyHash: assignmentPolicyHash(w, p.id, assessment),
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
        eyebrow={workshop ? 'Workshop schedule' : 'Across workshops'}
        title={workshop ? workshop.title : 'Calendar'}
        description={
          workshop
            ? `${deliveryWindowLabel(workshop)} · Record ${workshopRecordReference(workshop.id)} · All saved dates, including approved dates outside the window.`
            : 'View, staff and publish teacher sessions for ' + context.month + '.'
        }
        actions={
          <>
            <Link
              href={
                workshop
                  ? `/admin/workshop-definitions/${workshop.id}`
                  : '/admin/workshop-definitions'
              }
              className={buttonClasses()}
            >
              {workshop ? 'Workshop overview' : 'Open a workshop'}
            </Link>
            <Link
              href={schedulingHref('/admin/workshops/plan', context)}
              className={buttonClasses({ variant: 'secondary' })}
            >
              Choose teacher dates
            </Link>
            <Link
              href={schedulingHref('/admin/workshops/match', context)}
              className={buttonClasses({ variant: 'secondary' })}
            >
              {context.batch ? 'Assign PAs to these sessions' : 'Assign PAs'}
            </Link>
            <Link
              href={schedulingHref('/admin/workshops/new', context)}
              className={buttonClasses({ variant: 'ghost' })}
            >
              Schedule a confirmed teacher session
            </Link>
          </>
        }
      />
      <FormError message={query.error ?? warning} />
      {query.created && workshop && batchSessions && (
        <ClearSavedPlanningChoices
          storageKey={`workshop-planning:${actor.id}:${workshop.id}`}
          savedChoices={batchSessions
            .filter((session) => session.status !== 'CANCELLED')
            .map((session) => {
              const minute = vancouverMinuteOfDay(session.scheduledStart)
              return {
                classWorkshopId: session.classWorkshopId,
                date: vancouverDateKey(session.scheduledStart),
                startTime: `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`,
              }
            })}
        />
      )}
      {query.created && batchSessions && batchSessions.length > 0 && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"
        >
          {batchSessions.length} teacher session{batchSessions.length === 1 ? '' : 's'} saved as a
          draft.{' '}
          {batchSessions.every((session) => session.assignments.length === 0)
            ? 'No PAs assigned yet.'
            : 'Review current PA assignments below.'}{' '}
          <Link
            className="font-semibold underline"
            href={schedulingHref('/admin/workshops/match', context)}
          >
            Assign PAs to these sessions
          </Link>
          .
        </div>
      )}
      {query.matched === '1' && (
        <p role="status" className="rounded-lg bg-emerald-50 p-4 text-emerald-950">
          Draft PA assignments saved. Review each teacher session before publishing. No email has
          been sent.
        </p>
      )}
      {workshop && context.batch && (
        <p className="text-sm">
          Showing {batchSessions?.length ?? 0} teacher sessions from this saved batch.{' '}
          <Link
            className="underline"
            href={schedulingHref('/admin/workshops', { ...context, batch: undefined })}
          >
            Show the full workshop schedule
          </Link>
        </p>
      )}
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
          PA availability & workload
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
