import { auditStateSchema } from '@/lib/schemas/changes'
import { formatInstantRange } from '@/lib/time'
import { ArrowRight } from 'lucide-react'
import { StatusBadge } from '@/components/ui/status-badge'
export function ChangeSummary({ before, after }: { before: unknown; after: unknown }) {
  const states = [
    ['Before', auditStateSchema.parse(before)],
    ['After', auditStateSchema.parse(after)],
  ] as const
  return (
    <div className="grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]">
      {states.map(([label, state]) => (
        <div className="contents" key={label}>
          {label === 'After' && (
            <div className="hidden items-center text-slate-300 sm:flex" aria-hidden="true">
              <ArrowRight className="size-5" />
            </div>
          )}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                {label}
              </p>
              <StatusBadge status={state.status} />
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-900">
              {formatInstantRange(new Date(state.start), new Date(state.end))}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              PAs:{' '}
              <span className="text-slate-700">
                {state.pas.map((p) => p.name).join(', ') || 'None'}
              </span>
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
