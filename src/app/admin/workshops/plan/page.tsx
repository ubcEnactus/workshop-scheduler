import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { deliveryWindowLabel } from '@/lib/scheduling/delivery-windows'
import { PageHeader } from '@/components/ui/page-header'
import { FormError } from '@/components/form-error'

export default async function RunPlan({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireRole('ADMIN')
  const query = await searchParams
  const definitions = await prisma.workshopDefinition.findMany({
    orderBy: [{ deliveryStartsOn: 'desc' }, { title: 'asc' }],
  })
  const selected = definitions.find((run) => run.id === query.workshopDefinitionId)
  const context = new URLSearchParams({ step: 'plan' })
  for (const key of ['week', 'classSectionId', 'batch', 'filter', 'schoolId', 'month', 'error']) {
    const value = query[key]
    if (typeof value === 'string' && value.length <= 1000) context.set(key, value)
  }
  if (query.sessionId !== undefined) {
    const ids = (Array.isArray(query.sessionId) ? query.sessionId : [query.sessionId])
      .filter((id) => id.length > 0 && id.length <= 200)
      .slice(0, 200)
    // Preserve an explicit empty scope instead of opening the full workshop.
    for (const id of ids.length ? ids : ['unavailable']) context.append('sessionId', id)
  }
  if (selected)
    redirect(`/admin/workshop-definitions/${encodeURIComponent(selected.id)}?${context}`)
  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Workshop planning"
        title="Choose a workshop"
        description="Plan dates, staff sessions and publish from one workshop workspace."
      />
      <FormError message={typeof query.error === 'string' ? query.error : undefined} />
      {definitions.length ? (
        <ul className="space-y-3">
          {definitions.map((run) => (
            <li key={run.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <Link
                className="font-semibold underline"
                href={`/admin/workshop-definitions/${encodeURIComponent(run.id)}?${context}`}
              >
                {run.title}
              </Link>
              <p className="mt-1 text-sm text-slate-600">{deliveryWindowLabel(run)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p>
          No workshops yet.{' '}
          <Link className="underline" href="/admin/workshop-definitions?create=1#create-workshop">
            Create a workshop
          </Link>
          .
        </p>
      )}
    </main>
  )
}
