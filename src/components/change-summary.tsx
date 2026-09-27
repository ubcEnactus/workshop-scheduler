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
            {state.minPAs !== undefined && (
              <p className="mt-2 text-sm text-slate-600">
                Staffing: {state.pas.length} assigned · {state.minPAs}–{state.maxPAs} needed
                {state.pas.length < state.minPAs && state.status !== 'CANCELLED'
                  ? ' · Needs staff'
                  : ''}
              </p>
            )}
            {state.location && (
              <p className="mt-2 text-sm break-words text-slate-600">
                {state.location}
              </p>
            )}
            {state.participantInstructions && (
              <p className="mt-2 text-sm whitespace-pre-wrap text-slate-600">
                Participant instructions: {state.participantInstructions}
              </p>
            )}
            {state.hostTeacherName && (
              <p className="mt-2 text-sm text-slate-600">Teacher: {state.hostTeacherName}</p>
            )}
            {state.notes && (
              <p className="mt-2 text-sm whitespace-pre-wrap text-slate-600">
                Internal notes: {state.notes}
              </p>
            )}
            {state.dateExceptionReason && (
              <p className="mt-2 text-sm text-amber-800">
                Admin date exception: {state.dateExceptionReason}
              </p>
            )}
            {!!state.workloadOverrides?.length && (
              <p className="mt-2 text-sm text-amber-800">
                Recorded workload exceptions:{' '}
                {state.workloadOverrides
                  .map(
                    (override) =>
                      `${state.pas.find((pa) => pa.id === override.paId)?.name ?? 'PA'} (${[override.sameDay ? 'same day' : '', override.week ? 'same week' : ''].filter(Boolean).join(' + ')})`
                  )
                  .join(', ')}
              </p>
            )}
            {!!state.availabilityOverrides?.length && (
              <p className="mt-2 text-sm text-amber-800">
                ⚠ Assigned despite missing or partial availability:{' '}
                {state.availabilityOverrides
                  .map((override) => state.pas.find((pa) => pa.id === override.paId)?.name ?? 'PA')
                  .join(', ')}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
