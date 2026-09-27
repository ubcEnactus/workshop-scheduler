import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { monthSchema } from '@/lib/schemas/workshops'
import { vancouverMonthBounds } from '@/lib/time'
import { deliveryWindowLabel } from '@/lib/scheduling/delivery-windows'
import { PageHeader } from '@/components/ui/page-header'

export default async function MatchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireRole('ADMIN')
  const query = await searchParams
  const values = (key: string) => {
    const value = query[key]
    return (Array.isArray(value) ? value : value ? [value] : [])
      .filter((id) => id.length > 0 && id.length <= 200)
      .slice(0, 200)
  }
  const requested =
    typeof query.workshopDefinitionId === 'string' ? query.workshopDefinitionId : undefined
  const sessionIds = values('sessionId')
  const classIds = values('classId')
  const batch = typeof query.batch === 'string' ? query.batch : undefined
  const month = monthSchema.safeParse(query.month)
  const monthlyScope =
    query.legacy === '1' ||
    query.selection === '1' ||
    query.scopeKind === 'month' ||
    (query.classId !== undefined && query.month !== undefined)
  const bounds = monthlyScope && month.success ? vancouverMonthBounds(month.data) : undefined
  const scoped = !!(
    query.sessionId !== undefined ||
    query.classId !== undefined ||
    query.batch !== undefined ||
    monthlyScope
  )
  const validScope =
    (!monthlyScope || month.success) &&
    (query.sessionId === undefined || sessionIds.length > 0) &&
    (query.classId === undefined || classIds.length > 0) &&
    (query.batch === undefined || !!batch)
  const sessions =
    scoped && validScope
      ? await prisma.workshopSession.findMany({
          where: {
            ...(requested
              ? {
                  classWorkshop: {
                    workshopDefinitionId: requested,
                    ...(classIds.length ? { classSectionId: { in: classIds } } : {}),
                  },
                }
              : classIds.length
                ? { classWorkshop: { classSectionId: { in: classIds } } }
                : {}),
            ...(sessionIds.length ? { id: { in: sessionIds } } : {}),
            ...(batch ? { batchId: batch } : {}),
            ...(bounds ? { scheduledStart: { gte: bounds.start, lt: bounds.end } } : {}),
          },
          select: { id: true, classWorkshop: { select: { workshopDefinitionId: true } } },
        })
      : []
  const definitions = await prisma.workshopDefinition.findMany({
    where:
      scoped && !requested
        ? {
            id: {
              in: [
                ...new Set(sessions.map((session) => session.classWorkshop.workshopDefinitionId)),
              ],
            },
          }
        : undefined,
    orderBy: [{ deliveryStartsOn: 'desc' }, { title: 'asc' }],
  })
  function destination(id: string) {
    const context = new URLSearchParams({ step: 'staff' })
    for (const key of ['week', 'classSectionId', 'filter', 'schoolId', 'month', 'view']) {
      const value = query[key]
      if (typeof value === 'string' && value.length <= 200) context.set(key, value)
    }
    if (batch) context.set('batch', batch)
    if (scoped) {
      const scopedIds = sessions
        .filter((session) => session.classWorkshop.workshopDefinitionId === id)
        .map((session) => session.id)
      // Preserve an empty/removed scope instead of silently opening every session.
      for (const sessionId of scopedIds.length ? scopedIds : ['unavailable'])
        context.append('sessionId', sessionId)
    }
    return `/admin/workshop-definitions/${encodeURIComponent(id)}?${context}`
  }
  const selected = definitions.find((run) => run.id === requested)
  if (selected) redirect(destination(selected.id))
  if (!requested && scoped && definitions.length === 1) redirect(destination(definitions[0].id))
  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Private draft staffing"
        title="Choose a workshop to staff"
        description="Staffing now saves directly to the workshop draft, with Undo. Existing teams and dates stay unchanged."
      />
      {scoped && !definitions.length && (
        <p role="status">
          The selected sessions are no longer available. Choose a workshop from the workshop list.
        </p>
      )}
      <ul className="space-y-3">
        {definitions.map((run) => (
          <li key={run.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <Link className="font-semibold underline" href={destination(run.id)}>
              {run.title}
            </Link>
            <p className="mt-1 text-sm text-slate-600">{deliveryWindowLabel(run)}</p>
          </li>
        ))}
      </ul>
      <Link className="text-sm underline" href="/admin/workshop-definitions">
        All workshops
      </Link>
    </main>
  )
}
