import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { deliveryWindowLabel } from '@/lib/scheduling/delivery-windows'
import {
  workshopDeletionInclude,
  summarizeWorkshopDeletion,
} from '@/lib/scheduling/workshop-deletion'
import { FormError } from '@/components/form-error'
import { SubmitButton } from '@/components/submit-button'
import { buttonClasses } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { deleteWorkshopDefinition } from '../../../class-workshops/actions'
import { workshopRecordReference } from '../../workshop-reference'

export default async function DeleteWorkshopPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requireRole('ADMIN')
  const [{ id }, query] = await Promise.all([params, searchParams])
  const workshop = await prisma.workshopDefinition.findUnique({
    where: { id },
    include: workshopDeletionInclude,
  })
  if (!workshop) notFound()
  const summary = summarizeWorkshopDeletion(workshop)
  const backHref = `/admin/workshop-definitions/${workshop.id}`

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Final confirmation"
        title="Delete workshop?"
        description="Review the workshop and what will be removed before confirming."
      />
      <FormError message={query.error} />
      <Panel
        title={workshop.title}
        description={`${deliveryWindowLabel(workshop)} · Record ${workshopRecordReference(workshop.id)}`}
      >
        {summary.blockedReason ? (
          <div className="space-y-4">
            <div
              role="alert"
              className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
            >
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <p>{summary.blockedReason}</p>
            </div>
            <p className="text-sm text-slate-600">
              This workshop is kept as part of its delivery history. Cancelling a session does not
              make the workshop deletable.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href={backHref} className={buttonClasses({ variant: 'secondary' })}>
                Back to workshop
              </Link>
              <Link
                href={`/admin/workshops?workshopDefinitionId=${workshop.id}`}
                className={buttonClasses()}
              >
                Review teacher sessions
              </Link>
            </div>
          </div>
        ) : (
          <form action={deleteWorkshopDefinition} className="space-y-5">
            <input type="hidden" name="workshopDefinitionId" value={workshop.id} />
            <input type="hidden" name="expectedHash" value={summary.hash} />
            <input type="hidden" name="confirm" value="1" />
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              <p className="flex items-center gap-2 font-semibold">
                <AlertTriangle aria-hidden="true" className="size-5 shrink-0" />
                Are you sure you want to delete this workshop?
              </p>
              <p className="mt-2">
                This permanently removes the workshop and its planning records. This cannot be
                undone.
              </p>
            </div>
            <ul
              className="list-inside list-disc space-y-2 text-sm text-slate-700"
              aria-label="Records to delete"
            >
              <li>
                {summary.includedClasses} included teacher{summary.includedClasses === 1 ? '' : 's'}{' '}
                removed from this workshop
              </li>
              <li>
                {summary.draftSessions} draft teacher session
                {summary.draftSessions === 1 ? '' : 's'}
              </li>
              <li>
                {summary.assignments} draft PA assignment{summary.assignments === 1 ? '' : 's'}
              </li>
              <li>
                {summary.candidateTimes} workshop-specific candidate time
                {summary.candidateTimes === 1 ? '' : 's'}
              </li>
            </ul>
            <p className="text-sm text-slate-600">
              Private draft change history will also be removed. Schools, teachers, PAs, shared
              availability, and other workshops are kept.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href={backHref} className={buttonClasses({ variant: 'secondary' })}>
                Cancel
              </Link>
              <SubmitButton variant="danger" pendingLabel="Deleting…">
                Yes, delete workshop
              </SubmitButton>
            </div>
          </form>
        )}
      </Panel>
    </main>
  )
}
