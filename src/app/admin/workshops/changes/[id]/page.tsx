import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { changeRequestSchema } from '@/lib/schemas/changes'
import { FormError } from '@/components/form-error'
import { SubmitButton } from '@/components/submit-button'
import { ChangeSummary } from '@/components/change-summary'
import { applyWorkshopChange } from '../actions'
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
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <Link className="underline" href={'/admin/workshops/' + change.workshopId}>
        Back to workshop
      </Link>
      <h1 className="text-3xl font-semibold">Review workshop change</h1>
      <p>
        {change.workshop.classSection.name} · {data.kind.toLowerCase()}
      </p>
      <p>Reason: {data.reason}</p>
      <p>
        Published information stays in place until you apply this change. Current eligibility and
        the workshop version are checked again when applying.
      </p>
      <FormError message={query.error} />
      <ChangeSummary before={change.before} after={change.proposed} />
      {change.appliedAt ? (
        <p role="status">This change has been applied.</p>
      ) : change.workshop.version !== data.version ? (
        <p>Workshop changed. Return to the workshop and review a new change.</p>
      ) : (
        <form action={applyWorkshopChange}>
          <input type="hidden" name="id" value={id} />
          <SubmitButton>Apply workshop change</SubmitButton>
        </form>
      )}
      <p className="text-sm">
        Coordinate this change with the affected people outside the app. Schedule change emails are
        not sent.
      </p>
    </main>
  )
}
