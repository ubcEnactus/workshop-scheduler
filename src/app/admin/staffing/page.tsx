import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { loadSchedule } from '@/lib/scheduling/store'
import { workload } from '@/lib/scheduling/eligibility'
import { monthSchema } from '@/lib/schemas/workshops'
import { vancouverMonthKey } from '@/lib/time'
import { FormError } from '@/components/form-error'
import { SubmitButton } from '@/components/submit-button'
import { saveGap, saveQuota } from './actions'
import { AlertTriangle, Clock3, Gauge, Users } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { StatCard } from '@/components/ui/stat-card'
import { StatusBadge } from '@/components/ui/status-badge'
import { buttonClasses } from '@/components/ui/button'

export default async function StaffingSettings({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; error?: string; saved?: string }>
}) {
  await requireRole('ADMIN')
  const query = await searchParams
  const parsed = monthSchema.safeParse(query.month ?? vancouverMonthKey())
  const month = parsed.success ? parsed.data : vancouverMonthKey()
  const snapshot = await loadSchedule(prisma)
  const monthQuotas = snapshot.quotas.filter((quota) => quota.month === month)
  const overQuota = snapshot.pas.filter((pa) => {
    const quota = monthQuotas.find((item) => item.paId === pa.id)
    return quota ? workload(snapshot, pa.id, month) > quota.quota : false
  }).length
  return (
    <main className="page-content">
      <PageHeader
        eyebrow={`${month} staffing settings`}
        title="PA quotas and assignment gap"
        description="Set fair monthly targets and the minimum number of calendar days between a PA’s assignments."
      >
        <Link
          href={'/admin/workshops?month=' + month}
          className="text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          ← Back to workshops
        </Link>
      </PageHeader>
      <FormError message={query.error ?? (!parsed.success ? 'Invalid month.' : undefined)} />
      {query.saved && (
        <p
          role="status"
          className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800"
        >
          Settings saved. Existing assignments are retained; review any new eligibility warnings.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Active PAs"
          value={snapshot.pas.length}
          detail="Available for quota setup"
          icon={<Users className="size-5" />}
          tone="blue"
        />
        <StatCard
          label="Quotas set"
          value={`${monthQuotas.length}/${snapshot.pas.length}`}
          detail={`For ${month}`}
          icon={<Gauge className="size-5" />}
          tone="green"
        />
        <StatCard
          label="Over quota"
          value={overQuota}
          detail="Existing assignments retained"
          icon={<AlertTriangle className="size-5" />}
          tone={overQuota ? 'amber' : 'slate'}
        />
      </div>
      <Panel
        title="Assignment spacing"
        description="Count Vancouver calendar dates: a gap of 1 day permits Tuesday after Monday. This applies across all schools. A PA cannot work at the same school twice on one day."
      >
        <form action={saveGap} className="flex flex-wrap items-end gap-4">
          <input type="hidden" name="month" value={month} />
          <div className="field max-w-sm flex-1">
            <label htmlFor="gap">Minimum gap between assignments (days)</label>
            <input
              id="gap"
              name="minimumGapDays"
              type="number"
              min="1"
              max="365"
              step="1"
              required
              defaultValue={snapshot.minimumGapDays ?? ''}
              className="input"
            />
          </div>
          <SubmitButton>Save gap</SubmitButton>
        </form>
      </Panel>
      <Panel
        title="Monthly PA quotas"
        description="A missing quota makes that PA ineligible. Completed workshops count; cancelled workshops do not."
      >
        <form
          method="get"
          className="mb-5 flex flex-wrap items-end gap-3 border-b border-slate-100 pb-5"
        >
          <label className="field" htmlFor="quota-month">
            Quota month
            <input
              id="quota-month"
              type="month"
              name="month"
              defaultValue={month}
              required
              className="input"
            />
          </label>
          <button className={buttonClasses({ variant: 'secondary' })}>Show quotas</button>
        </form>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>PA</th>
                <th>Assigned</th>
                <th>Monthly quota</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.pas.map((pa) => {
                const quota = snapshot.quotas.find((q) => q.paId === pa.id && q.month === month)
                const count = workload(snapshot, pa.id, month)
                return (
                  <tr key={pa.id}>
                    <td>{pa.name ?? pa.email}</td>
                    <td>
                      <span className="mr-2 font-semibold text-slate-900">{count}</span>
                      {quota && count > quota.quota ? (
                        <StatusBadge status="REVIEW" label="Over quota" />
                      ) : (
                        ''
                      )}
                    </td>
                    <td>
                      <form action={saveQuota} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="paId" value={pa.id} />
                        <input type="hidden" name="month" value={month} />
                        <label className="sr-only" htmlFor={'quota-' + pa.id}>
                          Quota for {pa.name ?? pa.email}
                        </label>
                        <input
                          id={'quota-' + pa.id}
                          name="quota"
                          type="number"
                          min="0"
                          required
                          defaultValue={quota?.quota ?? ''}
                          placeholder="Not set"
                          className="input max-w-24"
                        />
                        <SubmitButton>Save quota</SubmitButton>
                      </form>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {snapshot.pas.length === 0 && (
          <div className="empty-state">
            <Users className="size-8 text-slate-300" /> No active PAs. Add PAs in admin management
            first.
          </div>
        )}
      </Panel>
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <Clock3 className="mt-0.5 size-4 shrink-0 text-slate-400" /> Existing assignments are
        retained when these settings change. Eligibility warnings identify work to review.
      </div>
    </main>
  )
}
