import Link from 'next/link'
import type { RunWorkspaceRecord } from '@/lib/scheduling/run-workspace'
import { staffingProblems, type ScheduleSnapshot } from '@/lib/scheduling/eligibility'
import { deliveryWindowLabel } from '@/lib/scheduling/delivery-windows'
import { workshopCalendarMonth } from '@/lib/scheduling/workshop-overview'
import { vancouverDateKey, vancouverMinuteOfDay, formatSlotRange } from '@/lib/time'
import { DefinitionForm } from '@/app/admin/workshop-definitions/definition-form'
import { WorkshopSessionCalendar, type OverviewSession } from './workshop-session-calendar'
import { PageHeader } from './ui/page-header'
import { buttonClasses } from './ui/button'
import { FormError } from './form-error'

export function WorkshopRunOverview({
  run,
  snapshot,
  query,
}: {
  run: RunWorkspaceRecord
  snapshot: ScheduleSnapshot
  query: Record<string, string | undefined>
}) {
  const path = `/admin/workshop-definitions/${run.id}`
  const today = vancouverDateKey(new Date())
  const all = run.classWorkshops.flatMap((enrollment) => enrollment.sessions)
  const month = workshopCalendarMonth(query.month, all, today, run.deliveryStartsOn)
  const sessions: OverviewSession[] = run.classWorkshops
    .flatMap((enrollment) =>
      enrollment.sessions.map((session) => {
        const item = snapshot.workshops.find((item) => item.id === session.id)
        return {
          id: session.id,
          date: vancouverDateKey(session.scheduledStart),
          status: session.status,
          time: formatSlotRange(
            vancouverMinuteOfDay(session.scheduledStart),
            (session.scheduledEnd.getTime() - session.scheduledStart.getTime()) / 60000
          ),
          school: session.hostSchoolName ?? enrollment.classSection.school.name,
          teacher:
            session.hostTeacherName ??
            enrollment.classSection.teacher?.name ??
            enrollment.classSection.teacher?.email ??
            'Teacher unavailable',
          location: session.location,
          minPAs: session.minPAs,
          team: session.assignments.map((assignment) => {
            const pa = snapshot.pas.find((pa) => pa.id === assignment.paId)
            return pa?.name ?? pa?.email ?? 'Inactive PA'
          }),
          problems:
            item && (session.status === 'PUBLISHED' || session.status === 'DRAFT')
              ? staffingProblems(snapshot, item)
              : [],
        }
      })
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        all.find((s) => s.id === a.id)!.scheduledStart.getTime() -
          all.find((s) => s.id === b.id)!.scheduledStart.getTime()
    )
  const drafts = sessions.filter((s) => s.status === 'DRAFT')
  const published = sessions.filter((s) => s.status === 'PUBLISHED')
  const completed = sessions.filter((s) => s.status === 'COMPLETED')
  const outstanding = run.classWorkshops.filter(
    (e) => e.status !== 'WAIVED' && !e.sessions.some((s) => s.status !== 'CANCELLED')
  ).length
  const attention = published.filter((s) => s.problems.length)
  const nextStep = drafts.some((s) => !s.problems.length)
    ? 'publish'
    : drafts.length
      ? 'staff'
      : 'plan'
  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Workshop overview"
        title={run.title}
        description={deliveryWindowLabel(run)}
        actions={
          <>
            <Link
              href="/admin/workshop-definitions"
              className={buttonClasses({ variant: 'ghost' })}
            >
              ← All workshops
            </Link>
            <Link
              href={`${path}?step=${nextStep}`}
              className={buttonClasses({ variant: 'secondary' })}
            >
              Continue scheduling
            </Link>
          </>
        }
      />
      <FormError message={query.error} />
      {query.detailsSaved === '1' && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          Workshop details saved.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Workshop summary">
        {[
          { label: 'Published', count: published.length },
          { label: 'Completed', count: completed.length },
          { label: 'Drafts', count: drafts.length },
          { label: 'Need dates', count: outstanding },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-2xl font-semibold">{item.count}</p>
            <p className="text-sm text-slate-600">{item.label}</p>
          </div>
        ))}
      </div>
      {attention.length > 0 && (
        <section
          aria-label="Sessions needing attention"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          <h2 className="font-semibold">
            {attention.length} published session{attention.length === 1 ? '' : 's'} need
            {attention.length === 1 ? 's' : ''} attention
          </h2>
          <ul className="mt-2 space-y-1">
            {attention.map((s) => (
              <li key={s.id}>
                <Link
                  className="underline"
                  href={`/admin/workshops/${s.id}?from=workshop&month=${s.date.slice(0, 7)}`}
                >
                  {s.school} · {s.date} ·{' '}
                  {s.team.length < s.minPAs ? 'Needs PAs' : 'Review staffing'}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <WorkshopSessionCalendar
        key={month}
        sessions={sessions.filter((s) => s.date.startsWith(month))}
        month={month}
        today={today}
        basePath={path}
      />
      <section
        className="rounded-xl border border-slate-200 bg-white p-5"
        aria-label="Workshop details"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Workshop details</h2>
          <Link
            href={`${path}?step=plan&addClasses=1#add-classes`}
            className={buttonClasses({ variant: 'secondary', size: 'sm' })}
          >
            Manage teachers
          </Link>
        </div>
        {run.description && (
          <p className="mt-3 text-sm whitespace-pre-wrap text-slate-600">{run.description}</p>
        )}
        <p className="mt-3 text-sm text-slate-600">
          {run.classWorkshops.length} included teachers · {run.durationMinutes ?? 60} minutes ·{' '}
          {run.defaultMinPAs}–{run.defaultMaxPAs} PAs per session
        </p>
        <details open={Boolean(query.error) || undefined} className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold">Edit workshop details</summary>
          <div className="mt-4">
            <DefinitionForm definition={run} returnToOverview />
          </div>
        </details>
      </section>
    </main>
  )
}
