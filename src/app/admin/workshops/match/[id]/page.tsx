import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { matchPlanSchema } from '@/lib/schemas/matching'
import { formatInstantRange } from '@/lib/time'
import { FormError } from '@/components/form-error'
import { SubmitButton } from '@/components/submit-button'
import { applyMatching } from '../actions'
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
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-12">
      <Link className="underline" href={'/admin/workshops/match?month=' + preview.month}>
        New staffing preview
      </Link>
      <h1 className="text-3xl font-semibold">Review PA assignments</h1>
      <p>
        Dates stay as planned. Applying is allowed for 15 minutes and requires unchanged scheduling
        inputs. Understaffed drafts can be saved but cannot be published.
      </p>
      <FormError message={query.error} />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption>Proposed staffing for {preview.month}</caption>
          <thead>
            <tr>
              {['Workshop', 'Current PAs', 'Proposed PAs', 'Review'].map((h) => (
                <th className="p-3" scope="col" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plan.map((p) => {
              const w = workshops.find((w) => w.id === p.workshopId)
              return (
                <tr key={p.workshopId} className="border-b">
                  <td className="p-3">
                    {w ? (
                      <>
                        <Link className="underline" href={'/admin/workshops/' + w.id}>
                          {w.classSection.name} · {w.classSection.school.name}
                        </Link>
                        <p>{formatInstantRange(w.scheduledStart, w.scheduledEnd)}</p>
                        <p>
                          {w.minPAs}–{w.maxPAs} PAs needed
                        </p>
                      </>
                    ) : (
                      'Workshop removed'
                    )}
                  </td>
                  <td className="p-3">{names(w?.assignments.map((a) => a.paId) ?? [])}</td>
                  <td className="p-3">{names(p.paIds)}</td>
                  <td className="p-3">
                    {p.reasons.length ? (
                      <ul>
                        {p.reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    ) : (
                      'Staffing requirements met.'
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {preview.appliedAt ? (
        <p role="status">This preview has been applied.</p>
      ) : preview.expiresAt.getTime() <= Date.now() ? (
        <p>Preview expired. Generate a new preview.</p>
      ) : (
        <form action={applyMatching}>
          <input type="hidden" name="id" value={id} />
          <SubmitButton>Apply PA assignments</SubmitButton>
        </form>
      )}
    </main>
  )
}
