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
export default async function ChangeReview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const actor = await requireRole('ADMIN')
  const { id } = await params,
    query = await searchParams
  const change = await prisma.workshopChange.findFirst({
    where: { id, actorId: actor.id },
    include: { workshop: { include: { classSection: true } } },
  })
  if (!change) notFound()
  const data = changeRequestSchema.parse(change.payload)
  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Final confirmation"
        title="Review workshop change"
        description={change.workshop.classSection.name}
        actions={<StatusBadge status={data.kind} />}
      >
        <Link
          className="text-sm font-medium text-slate-500 hover:text-slate-900"
          href={'/admin/workshops/' + change.workshopId}
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
      ) : change.workshop.version !== data.version ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          Workshop changed. Return to the workshop and review a new change.
        </p>
      ) : (
        <form
          action={applyWorkshopChange}
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-green-200 bg-green-50 p-5"
        >
          <input type="hidden" name="id" value={id} />
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
