import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { matchPlanSchema } from '@/lib/schemas/matching'
import { formatInstantRange } from '@/lib/time'
import { FormError } from '@/components/form-error'
import { SubmitButton } from '@/components/submit-button'
import { applyMatching } from '../actions'
import { AlertTriangle, CheckCircle2, Clock3, Sparkles, Users } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { StatCard } from '@/components/ui/stat-card'
export default async function MatchReview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const actor = await requireRole('ADMIN')
  const { id } = await params
  const query = await searchParams
  const preview = await prisma.matchingPreview.findFirst({ where: { id, actorId: actor.id } })
  if (!preview) notFound()
  const plan = matchPlanSchema.parse(preview.plan)
  const [workshops, pas] = await Promise.all([
    prisma.workshop.findMany({
      where: { id: { in: plan.map((p) => p.workshopId) } },
      include: { classSection: { include: { school: true } }, assignments: true },
    }),
    prisma.user.findMany({
      where: { role: 'PA', deletedAt: null },
      select: { id: true, name: true, email: true },
    }),
  ])
  const names = (ids: string[]) =>
    ids
      .map((id) => {
        const pa = pas.find((p) => p.id === id)
        return pa?.name ?? pa?.email ?? 'Inactive PA'
      })
      .join(', ') || 'None'
  const changed = plan.filter((item) => {
    const workshop = workshops.find((candidate) => candidate.id === item.workshopId)
    const current = workshop?.assignments.map((assignment) => assignment.paId).sort() ?? []
    return current.join('|') !== [...item.paIds].sort().join('|')
  }).length
  const needsReview = plan.filter((item) => item.reasons.length > 0).length
  return (
    <main className="page-content">
      <PageHeader
        eyebrow={`${preview.month} staffing preview`}
        title="Review PA assignments"
        description="Compare current and proposed staffing before applying the plan. Workshop dates and times stay unchanged."
      >
        <Link
          className="text-sm font-medium text-slate-500 hover:text-slate-900"
          href={'/admin/workshops/match?month=' + preview.month}
        >
          ← New staffing preview
        </Link>
      </PageHeader>
      <FormError message={query.error} />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Workshops reviewed"
          value={plan.length}
          detail={preview.month}
          icon={<Users className="size-5" />}
          tone="blue"
        />
        <StatCard
          label="Assignments changed"
          value={changed}
          detail="Compared with current staffing"
          icon={<Sparkles className="size-5" />}
          tone="green"
        />
        <StatCard
          label="Needs attention"
          value={needsReview}
          detail="Constraint notes to review"
          icon={<AlertTriangle className="size-5" />}
          tone={needsReview ? 'amber' : 'slate'}
        />
      </div>
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <Clock3 className="mt-0.5 size-4 shrink-0" />
        <p>
          Applying is allowed for 15 minutes and requires unchanged scheduling inputs. Understaffed
          drafts can be saved but cannot be published.
        </p>
      </div>
      <Panel
        title="Proposed staffing"
        description={`Review each of the ${plan.length} included workshops.`}
      >
        <p className="mb-3 text-xs text-slate-500 sm:hidden">
          Swipe horizontally to compare every staffing column.
        </p>
        <div
          className="table-scroll"
          role="region"
          aria-label="Scrollable staffing comparison"
          tabIndex={0}
        >
          <table className="data-table">
            <caption className="sr-only">Proposed staffing for {preview.month}</caption>
            <thead>
              <tr>
                {['Workshop', 'Current PAs', 'Proposed PAs', 'Review'].map((h) => (
                  <th scope="col" key={h}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plan.map((p) => {
                const w = workshops.find((w) => w.id === p.workshopId)
                return (
                  <tr key={p.workshopId} className={p.reasons.length ? 'bg-amber-50/50' : ''}>
                    <td className="min-w-56">
                      {w ? (
                        <>
                          <Link
                            className="font-semibold text-slate-900 hover:text-[#1e2a4a] hover:underline"
                            href={'/admin/workshops/' + w.id}
                          >
                            {w.classSection.name} · {w.classSection.school.name}
                          </Link>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatInstantRange(w.scheduledStart, w.scheduledEnd)}
                          </p>
                          <p className="mt-1 text-xs text-slate-600">
                            {w.minPAs}–{w.maxPAs} PAs needed
                          </p>
                        </>
                      ) : (
                        'Workshop removed'
                      )}
                    </td>
                    <td className="text-slate-500">
                      {names(w?.assignments.map((a) => a.paId) ?? [])}
                    </td>
                    <td className="font-medium text-slate-800">{names(p.paIds)}</td>
                    <td>
                      {p.reasons.length ? (
                        <ul className="space-y-1 text-xs leading-5 text-amber-800">
                          {p.reasons.map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700">
                          <CheckCircle2 className="size-3.5" /> Staffing requirements met.
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      {preview.appliedAt ? (
        <p
          role="status"
          className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800"
        >
          This preview has been applied.
        </p>
      ) : preview.expiresAt.getTime() <= Date.now() ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">
          Preview expired. Generate a new preview.
        </p>
      ) : (
        <form
          action={applyMatching}
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-green-200 bg-green-50 p-5"
        >
          <input type="hidden" name="id" value={id} />
          <div>
            <p className="font-semibold text-green-900">Ready to update the draft schedule?</p>
            <p className="mt-1 text-sm text-green-700">Protected assignments stay unchanged.</p>
          </div>
          <SubmitButton>Apply PA assignments</SubmitButton>
        </form>
      )}
    </main>
  )
}
