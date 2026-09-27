import { randomUUID } from 'node:crypto'
import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import type { RunWorkspaceRecord } from '@/lib/scheduling/run-workspace'
import { formatInstantRange, isCalendarDate } from '@/lib/time'
import { dateOnly } from '@/lib/scheduling/delivery-windows'
import { generateCandidatesFromClassContext } from '@/lib/scheduling/recurring-candidates'
import { assessAssignment, type ScheduledWorkshop } from '@/lib/scheduling/eligibility'
import type { ScheduleSnapshot } from '@/lib/scheduling/eligibility'
import { PlanningForm, type PlanningRow } from './planning-form'
import { buttonClasses } from './ui/button'

function clock(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function commitmentDescription(
  commitment: ReturnType<typeof assessAssignment>['commitments'][number]
) {
  const host = commitment.schoolName ?? 'Unknown school'
  const title = commitment.definitionTitle ? ` · ${commitment.definitionTitle}` : ''
  const gap = `${commitment.minutesBetween} minute${commitment.minutesBetween === 1 ? '' : 's'} between sessions`
  const location = commitment.location?.trim()
    ? `Location: ${commitment.location}.`
    : 'Location not recorded; travel feasibility has not been confirmed.'
  return `${host}${title} · ${formatInstantRange(commitment.scheduledStart, commitment.scheduledEnd)} · ${gap}. ${location}`
}

/** Embedded date planning for the canonical workshop workspace. */
export async function WorkshopPlanContent({
  run,
  snapshot,
  activeTeachers,
  query,
  selectedSessionIds,
}: {
  run: RunWorkspaceRecord
  snapshot: ScheduleSnapshot
  activeTeachers: { id: string; schoolId: string | null }[]
  query: Record<string, string | undefined>
  selectedSessionIds?: string[]
}) {
  const actor = await requireRole('ADMIN')
  if (!run.deliveryStartsOn || !run.deliveryEndsOn)
    return (
      <p className="text-sm text-amber-900">
        Set a shared delivery window before choosing teacher dates.
      </p>
    )
  const runStart = dateOnly(run.deliveryStartsOn)
  const runEnd = dateOnly(run.deliveryEndsOn)
  const requestedWeek = query.week ?? ''
  const viewStart =
    isCalendarDate(requestedWeek) && requestedWeek >= runStart && requestedWeek <= runEnd
      ? requestedWeek
      : runStart
  const viewEnd = addDays(viewStart, 6) < runEnd ? addDays(viewStart, 6) : runEnd
  const rows: PlanningRow[] = run.classWorkshops
    .filter(
      (item) =>
        item.status !== 'WAIVED' && !item.sessions.some((session) => session.status !== 'CANCELLED')
    )
    .sort((a, b) => a.classSection.name.localeCompare(b.classSection.name))
    .map((classWorkshop) => {
      const cls = classWorkshop.classSection
      const durationMinutes = run.durationMinutes ?? cls.defaultDurationMinutes
      const candidates = generateCandidatesFromClassContext({
        windowStart: viewStart,
        windowEnd: viewEnd,
        durationMinutes,
        meetings: cls.meetings,
        exceptions: cls.availabilityExceptions,
        schoolClosures: cls.school.closures,
        explicit: [...classWorkshop.availabilitySlots, ...cls.availabilitySlots],
        maxCandidates: 250,
      })
        .filter(
          () =>
            !cls.archivedAt &&
            !cls.school.deletedAt &&
            activeTeachers.some(
              (teacher) => teacher.id === cls.teacherId && teacher.schoolId === cls.schoolId
            )
        )
        .map((candidate) => {
          const proposed: ScheduledWorkshop = {
            id: `candidate:${classWorkshop.id}:${candidate.key}`,
            workshopDefinitionId: run.id,
            definitionTitle: run.title,
            classSectionId: cls.id,
            schoolId: cls.schoolId,
            schoolName: cls.school.name,
            scheduledStart: candidate.start,
            scheduledEnd: candidate.end,
            minPAs: run.defaultMinPAs,
            maxPAs: run.defaultMaxPAs,
            status: 'DRAFT',
            version: 0,
            locked: false,
            activeClass: true,
            hostingValid: true,
            assignments: [],
          }
          const assessed = snapshot.pas.map((pa) => ({
            pa,
            assessment: assessAssignment(snapshot, proposed, pa.id),
          }))
          const fairness = (a: (typeof assessed)[number], b: (typeof assessed)[number]) =>
            a.assessment.totalAssignments - b.assessment.totalAssignments ||
            a.pa.id.localeCompare(b.pa.id)
          return {
            id: candidate.key,
            date: candidate.date,
            startTime: clock(candidate.startMinute),
            endTime: clock(candidate.endMinute),
            label: formatInstantRange(candidate.start, candidate.end),
            recommended: assessed
              .filter((item) => item.assessment.automaticEligible)
              .sort(fairness)
              .map((item) => ({
                id: item.pa.id,
                name: item.pa.name ?? item.pa.email,
                totalAssignments: item.assessment.totalAssignments,
                reasons: [],
              })),
            warnings: assessed
              .filter(
                (item) =>
                  item.assessment.manualEligible &&
                  !item.assessment.availabilityWarnings.length &&
                  item.assessment.manualWarnings.length > 0
              )
              .sort(fairness)
              .map((item) => ({
                id: item.pa.id,
                name: item.pa.name ?? item.pa.email,
                totalAssignments: item.assessment.totalAssignments,
                reasons: item.assessment.manualWarnings.flatMap((warning) => [
                  warning.message,
                  ...warning.commitments.map(commitmentDescription),
                ]),
              })),
            blocked: assessed
              .filter(
                (item) =>
                  !item.assessment.manualEligible || item.assessment.availabilityWarnings.length > 0
              )
              .map((item) => ({
                id: item.pa.id,
                name: item.pa.name ?? item.pa.email,
                totalAssignments: item.assessment.totalAssignments,
                reasons: [...item.assessment.hardErrors, ...item.assessment.availabilityWarnings],
              })),
          }
        })
      candidates.sort(
        (a, b) =>
          b.recommended.length - a.recommended.length ||
          b.warnings.length - a.warnings.length ||
          (a.date + a.startTime).localeCompare(b.date + b.startTime)
      )
      return {
        id: classWorkshop.id,
        classSectionId: cls.id,
        label: `${cls.school.name} · ${cls.name}`,
        className: cls.name,
        schoolName: cls.school.name,
        durationMinutes,
        minPAs: run.defaultMinPAs,
        maxPAs: run.defaultMaxPAs,
        candidates,
      }
    })
  if (!rows.length)
    return (
      <p className="text-sm text-slate-600">
        {run.classWorkshops.length
          ? 'Every included teacher already has a session.'
          : 'Add teachers to this workshop to choose their dates.'}{' '}
        <Link
          className="font-semibold underline"
          href={`/admin/workshop-definitions/${run.id}?step=staff`}
        >
          Open Staff
        </Link>
      </p>
    )
  return (
    <section aria-label="Choose teacher dates" className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">
          {rows.length} class{rows.length === 1 ? '' : 'es'} need dates
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          All times are Vancouver time. Browse another week for more date options.
        </p>
      </div>
      <details className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
        <summary className="cursor-pointer font-medium">
          Date options: {viewStart} – {viewEnd} · Change week
        </summary>
        <form
          method="get"
          action={`/admin/workshop-definitions/${run.id}`}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="step" value="plan" />
          {['classSectionId', 'batch', 'filter', 'schoolId', 'month'].map((key) =>
            query[key] ? <input key={key} type="hidden" name={key} value={query[key]} /> : null
          )}
          {(selectedSessionIds ?? (query.sessionId ? [query.sessionId] : [])).map((id) => (
            <input key={id} type="hidden" name="sessionId" value={id} />
          ))}
          <label className="field max-w-xs">
            Show seven days starting
            <input
              className="input"
              type="date"
              name="week"
              min={runStart}
              max={runEnd}
              defaultValue={viewStart}
            />
          </label>
          <button className={buttonClasses({ variant: 'secondary' })}>Show dates</button>
          <p className="w-full text-xs text-slate-600">
            This only changes the options shown below; it does not select a date for any teacher.
            Your selections from other weeks are kept.
          </p>
        </form>
      </details>
      <PlanningForm
        key={`${run.id}:${viewStart}`}
        requestKey={randomUUID()}
        storageKey={`workshop-planning:${actor.id}:${run.id}`}
        workshopDefinitionId={run.id}
        expectedDefinitionRevision={run.revision}
        focusedClassId={query.classSectionId}
        viewStart={viewStart}
        viewEnd={viewEnd}
        rows={rows}
      />
    </section>
  )
}
