import Link from 'next/link'
import { LockKeyhole, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { schedulingHref, type SchedulingContext } from '@/lib/scheduling/navigation'
import {
  assessAssignment,
  assignmentPolicyHash,
  staffingProblems,
  type ScheduledWorkshop,
  type ScheduleSnapshot,
} from '@/lib/scheduling/eligibility'
import { formatInstantRange, vancouverMonthKey } from '@/lib/time'
import { assignPA, removePA, setWorkshopLock, publishWorkshop } from '@/app/admin/staffing/actions'
import { SubmitButton } from './submit-button'
import { StatusBadge } from '@/components/ui/status-badge'
import { StaffingDetails } from './staffing-details'
import { OverrideCandidate } from './override-candidate'
import { PAWarnings, PAHistory } from './pa-warnings'

function Identity({
  workshop,
  context,
}: {
  workshop: ScheduledWorkshop
  context?: SchedulingContext
}) {
  return (
    <>
      <input type="hidden" name="id" value={workshop.id} />
      <input type="hidden" name="version" value={workshop.version} />
      {context &&
        Object.entries(context).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
    </>
  )
}

export function WorkshopStaffing({
  workshop,
  snapshot,
  context,
}: {
  workshop: ScheduledWorkshop
  snapshot: ScheduleSnapshot
  context?: SchedulingContext
}) {
  const problems = ['DRAFT', 'PUBLISHED'].includes(workshop.status)
    ? staffingProblems(snapshot, workshop)
    : []
  const candidates = snapshot.pas
    .filter((pa) => !workshop.assignments.some((assignment) => assignment.paId === pa.id))
    .map((pa) => ({ ...pa, assessment: assessAssignment(snapshot, workshop, pa.id) }))
  const recommended = candidates.filter((candidate) => candidate.assessment.automaticEligible)
  const availabilityOptions = candidates
    .filter(
      (candidate) =>
        candidate.assessment.manualEligible &&
        candidate.assessment.availabilityWarnings.length > 0 &&
        candidate.assessment.manualWarnings.length === 0
    )
    .sort(
      (a, b) =>
        a.assessment.totalAssignments - b.assessment.totalAssignments || a.id.localeCompare(b.id)
    )
  const manualOptions = candidates
    .filter(
      (candidate) =>
        candidate.assessment.manualEligible && candidate.assessment.manualWarnings.length > 0
    )
    .sort(
      (a, b) =>
        a.assessment.totalAssignments - b.assessment.totalAssignments || a.id.localeCompare(b.id)
    )
  const blocked = candidates.filter((candidate) => !candidate.assessment.manualEligible)

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
            <Users className="size-5 text-[#1e2a4a]" /> Staffing
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {workshop.assignments.length} assigned · {workshop.minPAs} required
          </p>
        </div>
        {workshop.status === 'DRAFT' && workshop.locked && (
          <span className="text-xs text-slate-500">Auto-fill off</span>
        )}
      </div>
      <Link
        href={schedulingHref(
          '/admin/staffing',
          context ?? { month: vancouverMonthKey(workshop.scheduledStart) }
        )}
        className="inline-flex text-sm font-semibold text-[#1e2a4a] hover:underline"
      >
        Review PA availability &amp; workload
      </Link>

      {problems.length > 0 && (
        <StaffingDetails
          className="rounded-xl p-2"
          summary={
            problems.includes('Minimum staffing is not met.')
              ? 'Minimum staffing is not met.'
              : problems[0]
          }
        >
          {problems.includes('Minimum staffing is not met.') && (
            <p>
              {workshop.assignments.length} assigned; at least {workshop.minPAs} required.
            </p>
          )}
          {problems.some((problem) => problem !== 'Minimum staffing is not met.') && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {problems
                .filter((problem) => problem !== 'Minimum staffing is not met.')
                .map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
            </ul>
          )}
        </StaffingDetails>
      )}

      {workshop.assignments.length > 0 ? (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {workshop.assignments.map((assignment) => {
            const pa = snapshot.pas.find((candidate) => candidate.id === assignment.paId)
            const assessment = assessAssignment(snapshot, workshop, assignment.paId)
            return (
              <li
                key={assignment.paId}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <span className="flex items-center gap-3 text-sm font-medium text-slate-800">
                    <span className="flex size-8 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-[#1e2a4a]">
                      {(pa?.name ?? pa?.email ?? 'I').charAt(0).toUpperCase()}
                    </span>
                    {pa?.name ?? pa?.email ?? 'Inactive PA'}
                    <StatusBadge status={assignment.status} />
                  </span>
                  <PAWarnings
                    availabilityWarnings={assessment.availabilityWarnings}
                    warnings={assessment.manualWarnings.map((warning) => ({
                      ...warning,
                      commitments: warning.commitments.map(
                        (item) =>
                          `${item.schoolName ?? 'School'} · ${formatInstantRange(item.scheduledStart, item.scheduledEnd)} · ${item.minutesBetween} minutes between sessions`
                      ),
                    }))}
                  />
                </div>
                {workshop.status === 'DRAFT' && (
                  <form action={removePA}>
                    <Identity workshop={workshop} context={context} />
                    <input type="hidden" name="paId" value={assignment.paId} />
                    <SubmitButton variant="ghost">Remove PA</SubmitButton>
                  </form>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">No PAs assigned yet.</p>
      )}

      {workshop.status === 'DRAFT' && (
        <>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <h3 className="flex items-center gap-2 font-semibold text-slate-800">
              <UserPlus className="size-4" /> Recommended PAs
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Available for this session with no scheduling warnings.
            </p>
            {recommended.length ? (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {[...recommended]
                  .sort(
                    (a, b) =>
                      a.assessment.totalAssignments - b.assessment.totalAssignments ||
                      a.id.localeCompare(b.id)
                  )
                  .map((candidate) => (
                    <li
                      key={candidate.id}
                      className="rounded-lg border border-slate-200 bg-white p-3"
                    >
                      <p className="text-sm font-semibold text-slate-900">
                        {candidate.name ?? candidate.email}
                      </p>
                      <PAHistory totalAssignments={candidate.assessment.totalAssignments} />
                      <form action={assignPA} className="mt-2">
                        <Identity workshop={workshop} context={context} />
                        <input type="hidden" name="paId" value={candidate.id} />
                        <input
                          type="hidden"
                          name="expectedPolicyHash"
                          value={assignmentPolicyHash(workshop, candidate.id, candidate.assessment)}
                        />
                        <SubmitButton>Assign {candidate.name ?? candidate.email}</SubmitButton>
                      </form>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-600">
                No recommended PAs for this time. Review the other options below.
              </p>
            )}
          </div>

          {availabilityOptions.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-900">Other PAs</h3>
              <ul className="grid gap-3 sm:grid-cols-2">
                {availabilityOptions.map((candidate) => (
                  <li
                    key={candidate.id}
                    className="rounded-lg border border-amber-300 bg-amber-50 p-3"
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      {candidate.name ?? candidate.email}
                    </p>
                    <PAWarnings availabilityWarnings={candidate.assessment.availabilityWarnings} />
                    <PAHistory totalAssignments={candidate.assessment.totalAssignments} />
                    <form action={assignPA} className="mt-2">
                      <Identity workshop={workshop} context={context} />
                      <input type="hidden" name="paId" value={candidate.id} />
                      <input
                        type="hidden"
                        name="expectedPolicyHash"
                        value={assignmentPolicyHash(workshop, candidate.id, candidate.assessment)}
                      />
                      <SubmitButton>Assign {candidate.name ?? candidate.email}</SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {manualOptions.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-900">PAs with workload warnings</h3>
              {manualOptions.map((candidate) => {
                const policyHash = assignmentPolicyHash(
                  workshop,
                  candidate.id,
                  candidate.assessment
                )
                return (
                  <OverrideCandidate
                    key={`${workshop.id}:${candidate.id}:${policyHash}`}
                    name={candidate.name ?? candidate.email}
                    totalAssignments={candidate.assessment.totalAssignments}
                    availabilityWarnings={candidate.assessment.availabilityWarnings}
                    warnings={candidate.assessment.manualWarnings.map((warning) => ({
                      code: warning.code,
                      message: warning.message,
                      commitments: warning.commitments.map(
                        (item) =>
                          `${item.schoolName ?? 'School'} · ${formatInstantRange(item.scheduledStart, item.scheduledEnd)} · ${item.minutesBetween} minutes between sessions`
                      ),
                    }))}
                  >
                    <form action={assignPA}>
                      <Identity workshop={workshop} context={context} />
                      <input type="hidden" name="paId" value={candidate.id} />
                      <input type="hidden" name="expectedPolicyHash" value={policyHash} />
                      <SubmitButton>Assign {candidate.name ?? candidate.email}</SubmitButton>
                    </form>
                  </OverrideCandidate>
                )
              })}
            </div>
          )}

          {blocked.length > 0 && (
            <details className="rounded-xl border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer font-semibold text-slate-800">
                Blocked PAs ({blocked.length})
              </summary>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {blocked.map((candidate) => (
                  <li key={candidate.id} className="rounded-lg border border-slate-200 p-3">
                    <p className="text-sm font-semibold text-slate-900">
                      {candidate.name ?? candidate.email}
                    </p>
                    <PAWarnings hardErrors={candidate.assessment.hardErrors} />
                  </li>
                ))}
              </ul>
            </details>
          )}

          <details className="rounded-xl border border-slate-200 p-4">
            <summary className="text-sm text-slate-600">Auto-fill settings</summary>
            <form
              action={setWorkshopLock}
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <Identity workshop={workshop} context={context} />
              <input type="hidden" name="locked" value={workshop.locked ? 'false' : 'true'} />
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <LockKeyhole className="size-4" /> Automatic additions
              </span>
              <SubmitButton variant="secondary">
                {workshop.locked ? 'Allow auto-fill' : 'Exclude session from auto-fill'}
              </SubmitButton>
            </form>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Auto-fill adds missing PAs when you use it in the workshop Staff view.
            </p>
          </details>
          <form
            action={publishWorkshop}
            className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-green-200 bg-green-50 p-4"
          >
            <Identity workshop={workshop} context={context} />
            <div className="max-w-2xl">
              <p className="flex items-center gap-2 text-sm font-semibold text-green-900">
                <ShieldCheck className="size-4" /> Make this session official?
              </p>
              <p className="mt-1 text-xs leading-5 text-green-800">
                Assigned PAs and school teachers will see this session. Contact them separately;
                publishing does not send email.
              </p>
            </div>
            <SubmitButton pendingLabel="Publishing session…" disabled={problems.length > 0}>
              Publish session
            </SubmitButton>
          </form>
        </>
      )}
    </section>
  )
}
