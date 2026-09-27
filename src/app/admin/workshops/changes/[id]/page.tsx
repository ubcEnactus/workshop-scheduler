import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { changeRequestSchema } from '@/lib/schemas/changes'
import { FormError } from '@/components/form-error'
import { SubmitButton } from '@/components/submit-button'
import { ChangeSummary } from '@/components/change-summary'
import { applyWorkshopChange } from '../actions'
import { AlertTriangle, CheckCircle2, ClipboardCheck } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { StatusBadge } from '@/components/ui/status-badge'
import { parseSchedulingContext, schedulingHref } from '@/lib/scheduling/navigation'
import { loadSchedule, SchedulingError } from '@/lib/scheduling/store'
import { proposeChange, changeScheduleScope } from '@/lib/scheduling/changes'
import { scheduleHash } from '@/lib/scheduling/matching-preview'
import { formatInstantRange } from '@/lib/time'
export default async function ChangeReview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const actor = await requireRole('ADMIN')
  const { id } = await params,
    query = await searchParams
  const change = await prisma.workshopChange.findFirst({
    where: { id, actorId: actor.id },
    include: {
      workshopSession: { include: { classWorkshop: { include: { classSection: true } } } },
    },
  })
  if (!change) notFound()
  const data = changeRequestSchema.parse(change.payload)
  const context = query.month ? parseSchedulingContext(query) : undefined
  let review: Awaited<ReturnType<typeof proposeChange>> | undefined
  let staleReason: string | undefined
  const snapshot = !change.appliedAt
    ? await loadSchedule(prisma, changeScheduleScope(data))
    : undefined
  if (snapshot) {
    try {
      if (data.inputHash && data.inputHash !== scheduleHash(snapshot))
        throw new SchedulingError(
          'Availability or commitments changed. Return to the session and review a new change.'
        )
      review = await proposeChange(prisma, snapshot, data, { actorId: actor.id, preview: true })
    } catch (error) {
      if (!(error instanceof SchedulingError)) throw error
      staleReason = error.message
    }
  }
  const dateWarning = Boolean(
    review?.next.dateExceptionReason &&
    (!review.current.dateExceptionApproved ||
      review.current.scheduledStart.getTime() !== review.next.scheduledStart.getTime() ||
      review.current.scheduledEnd.getTime() !== review.next.scheduledEnd.getTime())
  )
  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Final confirmation"
        title="Review workshop change"
        description={change.workshopSession.classWorkshop.classSection.name}
        actions={<StatusBadge status={data.kind} />}
      >
        <Link
          className="text-sm font-medium text-slate-500 hover:text-slate-900"
          href={
            context
              ? schedulingHref('/admin/workshops/' + change.workshopSessionId, context)
              : '/admin/workshops/' + change.workshopSessionId
          }
        >
          ← Back to workshop
        </Link>
      </PageHeader>
      <FormError message={query.error} />
      <Panel
        title="Proposed change"
        description="Compare the current workshop with the new state before applying."
      >
        <ChangeSummary before={change.before} after={change.proposed} />
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Reason</p>
          <p className="mt-2 text-sm leading-6 text-slate-800">{data.reason}</p>
        </div>
      </Panel>
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>
          Published information stays in place until you apply this change. Current eligibility and
          the workshop version are checked again when applying.
        </p>
      </div>
      {change.appliedAt ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-800"
        >
          <CheckCircle2 className="size-4" /> This change has been applied.
        </p>
      ) : staleReason || change.workshopSession.version !== data.version ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          {staleReason ?? 'Workshop changed. Return to the workshop and review a new change.'}
        </p>
      ) : (
        <form
          action={applyWorkshopChange}
          className="space-y-5 rounded-xl border border-slate-200 bg-white p-5"
        >
          <input type="hidden" name="id" value={id} />
          {context &&
            Object.entries(context).map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
          {review?.warningDetails.map(({ paId, assessment }) => (
            <div
              key={paId}
              className={`rounded-xl border p-4 text-sm ${assessment.manualWarnings.some((warning) => warning.code === 'SAME_DAY') ? 'border-red-300 bg-red-50 text-red-900' : 'border-amber-300 bg-amber-50 text-amber-900'}`}
            >
              <p className="font-semibold">
                {snapshot?.pas.find((pa) => pa.id === paId)?.name ?? 'PA'}
              </p>
              {assessment.availabilityWarnings.map((warning) => (
                <p key={warning} className="mt-2">
                  ⚠ {warning}
                </p>
              ))}
              {assessment.manualWarnings.map((warning) => (
                <div key={warning.code} className="mt-2">
                  <p>{warning.message}</p>
                  <ul className="mt-2 space-y-1">
                    {warning.commitments.map((commitment) => (
                      <li key={commitment.workshopSessionId}>
                        {commitment.schoolName ?? 'School'} ·{' '}
                        {commitment.definitionTitle ?? 'Workshop'} ·{' '}
                        {formatInstantRange(commitment.scheduledStart, commitment.scheduledEnd)} ·{' '}
                        {commitment.minutesBetween} minutes between sessions
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
          {dateWarning && (
            <label className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <input type="checkbox" name="dateExceptionConfirmed" required className="mt-1" />
              <span>
                I confirmed this date and time with the teacher and approve the exception to its
                availability or the run’s delivery window. The reason above will be recorded.
              </span>
            </label>
          )}
          {review &&
            review.next.status === 'PUBLISHED' &&
            review.next.assignments.length < review.next.minPAs && (
              <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                This session will remain published with a staffing deficit. It will appear in Needs
                staff until the missing PAs are assigned.
              </p>
            )}
          <div className="flex items-start gap-3">
            <ClipboardCheck className="mt-0.5 size-5 text-green-700" />
            <div>
              <p className="font-semibold text-green-900">Ready to apply this change?</p>
              <p className="mt-1 text-sm text-green-700">
                The action will be added to workshop history.
              </p>
            </div>
          </div>
          <SubmitButton>Apply workshop change</SubmitButton>
        </form>
      )}
      <p className="text-sm text-slate-500">
        Coordinate this change with the affected people outside the app. Schedule change emails are
        not sent.
      </p>
    </main>
  )
}
