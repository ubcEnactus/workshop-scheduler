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
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-6 py-12">
      <Link href={'/admin/workshops?month=' + month} className="underline">
        Back to workshops
      </Link>
      <h1 className="text-3xl font-semibold">PA quotas and assignment gap</h1>
      <FormError message={query.error ?? (!parsed.success ? 'Invalid month.' : undefined)} />
      {query.saved && (
        <p role="status">
          Settings saved. Existing assignments are retained; review any new eligibility warnings.
        </p>
      )}
      <form action={saveGap} className="space-y-3 rounded border p-4">
        <label htmlFor="gap" className="block font-medium">
          Minimum gap between assignments (minutes)
        </label>
        <input
          id="gap"
          name="minimumGapMinutes"
          type="number"
          min="1"
          max="10080"
          required
          defaultValue={snapshot.minimumGapMinutes ?? ''}
          className="rounded border p-2"
        />
        <p className="text-sm">
          Applies before and after every assignment, including at the same school.
        </p>
        <SubmitButton>Save gap</SubmitButton>
      </form>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="block" htmlFor="quota-month">
          Quota month{' '}
          <input
            id="quota-month"
            type="month"
            name="month"
            defaultValue={month}
            required
            className="block rounded border p-2"
          />
        </label>
        <button className="rounded border p-2">Show quotas</button>
      </form>
      <p>
        Missing quota means a PA is ineligible. Completed workshops count toward quota; cancelled
        workshops do not.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="p-2">PA</th>
              <th className="p-2">Assigned</th>
              <th className="p-2">Monthly quota</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.pas.map((pa) => {
              const quota = snapshot.quotas.find((q) => q.paId === pa.id && q.month === month)
              const count = workload(snapshot, pa.id, month)
              return (
                <tr key={pa.id} className="border-t">
                  <td className="p-2">{pa.name ?? pa.email}</td>
                  <td className="p-2">
                    {count}
                    {quota && count > quota.quota ? ' · Over quota' : ''}
                  </td>
                  <td className="p-2">
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
                        className="w-24 rounded border p-2"
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
      {snapshot.pas.length === 0 && <p>No active PAs. Add PAs in admin management first.</p>}
    </main>
  )
}
