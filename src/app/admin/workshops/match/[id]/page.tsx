import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { matchPlanSchema, parseStoredMatchingScope } from '@/lib/schemas/matching'
import { formatInstantRange } from '@/lib/time'
import { PageHeader } from '@/components/ui/page-header'

type ArchivedRow = { workshopSessionId: string; paIds: string[]; reasons: string[] }

function archivedRows(value: unknown): ArchivedRow[] {
  const current = matchPlanSchema.safeParse(value)
  if (current.success) return current.data
  if (!Array.isArray(value)) return []
  return value.flatMap((item: unknown) => {
    if (
      !item ||
      typeof item !== 'object' ||
      !('workshopSessionId' in item) ||
      typeof item.workshopSessionId !== 'string'
    )
      return []
    return [
      {
        workshopSessionId: item.workshopSessionId,
        paIds:
          'paIds' in item && Array.isArray(item.paIds)
            ? item.paIds.filter((id: unknown): id is string => typeof id === 'string')
            : [],
        reasons:
          'reasons' in item && Array.isArray(item.reasons)
            ? item.reasons.filter((reason: unknown): reason is string => typeof reason === 'string')
            : [],
      },
    ]
  })
}

export default async function MatchReview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const actor = await requireRole('ADMIN')
  const { id } = await params
  const query = await searchParams
  const preview = await prisma.matchingPreview.findFirst({ where: { id, actorId: actor.id } })
  if (!preview) notFound()
  const rows = archivedRows(preview.plan)
  let scopedDefinitionId: string | undefined
  let scopeBatch: string | undefined
  let scopeIds: string[] | undefined
  try {
    const scope = parseStoredMatchingScope(preview.month, preview.classIds)
    if (scope.kind !== 'month') scopedDefinitionId = scope.workshopDefinitionId
    if (scope.kind === 'batch') scopeBatch = scope.batchId
    if (scope.kind === 'sessions') scopeIds = scope.workshopSessionIds
  } catch {
    /* Older proposal formats still remain readable below. */
  }
  const [sessions, pas] = await Promise.all([
    prisma.workshopSession.findMany({
      where: { id: { in: rows.map((row) => row.workshopSessionId) } },
      include: {
        classWorkshop: {
          include: { workshopDefinition: true, classSection: { include: { school: true } } },
        },
      },
    }),
    prisma.user.findMany({
      where: { role: 'PA', deletedAt: null },
      select: { id: true, name: true, email: true },
    }),
  ])
  const definitionIds = [
    ...new Set([
      ...(scopedDefinitionId ? [scopedDefinitionId] : []),
      ...sessions.map((session) => session.classWorkshop.workshopDefinitionId),
    ]),
  ]
  const definitions = await prisma.workshopDefinition.findMany({
    where: { id: { in: definitionIds } },
    select: { id: true, title: true },
  })
  function currentDraftHref(definitionId: string) {
    const context = new URLSearchParams({ step: 'staff' })
    for (const key of ['month', 'week', 'schoolId', 'classSectionId', 'filter']) {
      const value = query[key]
      if (typeof value === 'string' && value.length <= 200) context.set(key, value)
    }
    if (scopeBatch) context.set('batch', scopeBatch)
    const selected = (scopeIds ?? rows.map((row) => row.workshopSessionId)).filter((sessionId) =>
      sessions.some(
        (session) =>
          session.id === sessionId && session.classWorkshop.workshopDefinitionId === definitionId
      )
    )
    // Missing historical sessions must not turn an old selection into the entire run.
    for (const sessionId of selected.length ? selected : ['unavailable'])
      context.append('sessionId', sessionId)
    return `/admin/workshop-definitions/${encodeURIComponent(definitionId)}?${context}`
  }
  const names = (ids: string[]) =>
    ids
      .map((paId) => {
        const pa = pas.find((candidate) => candidate.id === paId)
        return pa?.name ?? pa?.email ?? 'Inactive or removed PA'
      })
      .join(', ') || 'No PAs proposed'
  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Historical staffing proposal"
        title="Archived staffing proposal"
        description="Read-only history from the previous proposal workflow. Open the workshop to edit its current private draft."
      />
      <p
        role="status"
        className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"
      >
        This proposal cannot be edited or applied.{' '}
        {preview.appliedAt
          ? 'Its assignments were saved at the time; subsequent changes are not shown in this proposal.'
          : 'The proposed assignments were never saved to the draft.'}{' '}
        Opening this page changes nothing.
      </p>
      <div className="flex flex-wrap gap-3">
        {definitions.map((definition) => (
          <Link
            key={definition.id}
            className="font-semibold underline"
            href={currentDraftHref(definition.id)}
          >
            Open current draft: {definition.title}
          </Link>
        ))}
        {!definitions.length && (
          <Link className="font-semibold underline" href="/admin/workshop-definitions">
            Open workshops
          </Link>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Session labels and PA names reflect current records. The proposed PA list below is retained
        history, not the current team.
      </p>
      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((row) => {
            const session = sessions.find((candidate) => candidate.id === row.workshopSessionId)
            return (
              <li
                key={row.workshopSessionId}
                className="space-y-2 rounded-xl border border-slate-200 bg-white p-4"
              >
                <h2 className="font-semibold">
                  {session
                    ? `${session.classWorkshop.classSection.name} · ${session.classWorkshop.classSection.school.name}`
                    : 'Removed teacher session'}
                </h2>
                {session && (
                  <p className="text-sm text-slate-600">
                    Current date: {formatInstantRange(session.scheduledStart, session.scheduledEnd)}
                  </p>
                )}
                <p className="text-sm">
                  <strong>Archived proposal:</strong> {names(row.paIds)}
                </p>
                {row.reasons.length > 0 && (
                  <details className="text-sm text-slate-600">
                    <summary className="cursor-pointer">Historical notes</summary>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {row.reasons.map((reason, index) => (
                        <li key={index}>{reason}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-slate-600">
          This older proposal has no readable session summary. Its stored record has been preserved.
        </p>
      )}
    </main>
  )
}
