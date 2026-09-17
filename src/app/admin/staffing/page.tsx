import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { loadSchedule } from '@/lib/scheduling/store'
import { workload } from '@/lib/scheduling/eligibility'
import { parseSchedulingContext, schedulingHref } from '@/lib/scheduling/navigation'
import { shiftMonth } from '@/lib/time'
import { FormError } from '@/components/form-error'
import { SubmitButton } from '@/components/submit-button'
import { QuotaTable } from '@/components/quota-table'
import { ContextMonth } from '@/components/context-month'
import { saveGap } from './actions'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'

export default async function StaffingSettings({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requireRole('ADMIN')
  const query = await searchParams
  const context = parseSchedulingContext(query)
  const { snapshot, settings } = await prisma.$transaction(
    async (tx) => ({
      snapshot: await loadSchedule(tx),
      settings: await tx.schedulingSettings.findUniqueOrThrow({ where: { id: 1 } }),
    }),
    { isolationLevel: 'RepeatableRead' }
  )
  const previousMonth = shiftMonth(context.month, -1)
  const rows = snapshot.pas.map((pa) => ({
    id: pa.id,
    name: pa.name ?? pa.email,
    assigned: workload(snapshot, pa.id, context.month),
    quota:
      snapshot.quotas.find((q) => q.paId === pa.id && q.month === context.month)?.quota ?? null,
    previous:
      snapshot.quotas.find((q) => q.paId === pa.id && q.month === previousMonth)?.quota ?? null,
  }))
  return (
    <main className="page-content">
      <PageHeader
        eyebrow={context.month + ' staffing settings'}
        title="PA quotas and assignment gap"
        description="Edit monthly quotas together, then review and save your changes."
      >
        <Link className="text-sm underline" href={schedulingHref('/admin/workshops', context)}>
          ← Back to workshops
        </Link>
      </PageHeader>
      <FormError message={query.error} />
      {query.saved && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          Settings saved. Existing assignments are retained; review any new eligibility warnings.
        </p>
      )}
      <ContextMonth context={context} path="/admin/staffing" label="Quota month" />
      <Panel
        title="Monthly PA quotas"
        description="A missing quota makes that PA ineligible. Completed workshops count; cancelled workshops do not."
      >
        <QuotaTable
          key={context.month + ':' + settings.revision}
          context={context}
          revision={settings.revision}
          rows={rows}
          previousMonth={previousMonth}
          inactivePreviousCount={
            snapshot.quotas.filter(
              (q) => q.month === previousMonth && !snapshot.pas.some((p) => p.id === q.paId)
            ).length
          }
        />
        {!rows.length && (
          <p>
            No active PAs.{' '}
            <Link className="underline" href={schedulingHref('/admin/pas', context)}>
              Add PAs
            </Link>{' '}
            first.
          </p>
        )}
      </Panel>
      <Panel
        title="Assignment spacing"
        description="Default: 7 days between assignments across all schools, measured by Vancouver calendar dates. Seven days permits the same weekday the following week. A PA cannot work at one school twice on the same date."
      >
        <form action={saveGap} className="flex flex-wrap items-end gap-4">
          {Object.entries(context).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
          <label className="field max-w-sm flex-1" htmlFor="gap">
            Minimum gap between assignments (days)
            <input
              id="gap"
              name="minimumGapDays"
              type="number"
              min="1"
              max="365"
              step="1"
              required
              defaultValue={snapshot.minimumGapDays ?? 7}
              className="input"
            />
          </label>
          <SubmitButton>Save gap</SubmitButton>
        </form>
      </Panel>
    </main>
  )
}
