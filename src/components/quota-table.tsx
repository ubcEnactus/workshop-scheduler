'use client'
import { ReadyFields } from './ready-fields'
import { useActionState, useState } from 'react'
import { saveQuotas } from '@/app/admin/staffing/bulk-quota-actions'
import { type SchedulingContext } from '@/lib/scheduling/navigation'
import { SubmitButton } from './submit-button'
import { Button } from './ui/button'
export function QuotaTable({
  context,
  revision,
  rows,
  previousMonth,
  inactivePreviousCount,
}: {
  context: SchedulingContext
  revision: number
  rows: {
    id: string
    name: string
    assigned: number
    quota: number | null
    previous: number | null
  }[]
  previousMonth: string
  inactivePreviousCount: number
}) {
  const initial = Object.fromEntries(
    rows.map((r) => [r.id, r.quota === null ? '' : String(r.quota)])
  )
  const [values, setValues] = useState(initial)
  const [undo, setUndo] = useState<Record<string, string> | null>(null)
  const [copyNotice, setCopyNotice] = useState('')
  const [state, action, pending] = useActionState(saveQuotas, {})
  const dirty = rows.some((r) => values[r.id] !== initial[r.id])
  return (
    <form action={action} className="space-y-4">
      <ReadyFields disabled={pending}>
        {Object.entries(context).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <input type="hidden" name="revision" value={revision} />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setUndo({ ...values })
              setValues((current) =>
                Object.fromEntries(
                  rows.map((r) => [r.id, r.previous === null ? current[r.id] : String(r.previous)])
                )
              )
              setCopyNotice(
                'Copied ' +
                  previousMonth +
                  '. ' +
                  rows.filter((r) => r.previous === null).length +
                  ' PAs have no previous quota and kept their current entries. ' +
                  inactivePreviousCount +
                  ' inactive PAs were skipped. Review before saving.'
              )
            }}
          >
            Copy previous month
          </Button>
          {undo && (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setValues(undo)
                setUndo(null)
                setCopyNotice('Copy undone.')
              }}
            >
              Undo copy
            </Button>
          )}
        </div>
        {copyNotice && (
          <p role="status" className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
            {copyNotice}
          </p>
        )}
        {state.error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {state.error}{' '}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (!dirty || window.confirm('Reload and discard your unsaved quota edits?'))
                  window.location.reload()
              }}
            >
              Reload quotas
            </Button>
          </p>
        )}
        <p className="text-sm text-slate-600">
          Blank means no quota set. Zero deliberately permits no assignments. Existing assignments
          remain intact.
        </p>
        <div className="table-scroll">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-2">PA</th>
                <th className="p-2">Assigned</th>
                <th className="p-2">Monthly quota</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="p-2 font-medium">{row.name}</td>
                  <td className="p-2">
                    {row.assigned}
                    {values[row.id] !== '' && row.assigned > Number(values[row.id]) && (
                      <p className="text-xs text-amber-800">Over quota</p>
                    )}
                  </td>
                  <td className="p-2">
                    <input type="hidden" name="paId" value={row.id} />
                    <label className="sr-only" htmlFor={'quota-' + row.id}>
                      Quota for {row.name}
                    </label>
                    <input
                      id={'quota-' + row.id}
                      name="quota"
                      type="text"
                      inputMode="numeric"
                      className="input max-w-28"
                      placeholder="Not set"
                      value={values[row.id]}
                      disabled={pending}
                      onChange={(e) => setValues({ ...values, [row.id]: e.target.value })}
                      aria-invalid={!!state.fields?.[row.id]}
                      aria-describedby={
                        state.fields?.[row.id] ? 'quota-error-' + row.id : undefined
                      }
                    />
                    {state.fields?.[row.id] && (
                      <p id={'quota-error-' + row.id} className="text-xs text-red-800">
                        {state.fields[row.id]}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <span className="text-sm text-slate-600">
            {dirty ? 'Unsaved quota changes' : 'All quota changes saved'}
          </span>
          <SubmitButton disabled={!rows.length}>Save changes</SubmitButton>
        </div>
      </ReadyFields>
    </form>
  )
}
