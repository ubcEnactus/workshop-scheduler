import { AlertTriangle, CircleX } from 'lucide-react'

export type PAWarning = {
  code: 'SAME_DAY' | 'SAME_WEEK'
  message: string
  commitments?: string[]
}

/** Consequential warnings stay visible; supporting commitments are optional detail. */
export function PAWarnings({
  availabilityWarnings = [],
  warnings = [],
  hardErrors = [],
  name,
}: {
  availabilityWarnings?: readonly string[]
  warnings?: readonly PAWarning[]
  hardErrors?: readonly string[]
  name?: string
}) {
  const commitments = [...new Set(warnings.flatMap((warning) => warning.commitments ?? []))]
  const items = [
    ...hardErrors.map((message) => ({ message, danger: true, blocked: true })),
    ...availabilityWarnings.map((message) => ({ message, danger: false, blocked: false })),
    ...warnings.map((warning) => ({
      message: warning.message,
      danger: warning.code === 'SAME_DAY',
      blocked: false,
    })),
  ]
  if (!items.length) return null
  return (
    <div className="mt-2 space-y-1.5">
      {items.map((item, index) => {
        const Icon = item.blocked ? CircleX : AlertTriangle
        return (
          <p
            key={`${item.message}:${index}`}
            className={`flex items-start gap-1.5 text-xs leading-5 ${item.danger ? 'font-semibold text-red-900' : 'text-amber-900'}`}
          >
            <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>
              {name ? `${name}: ` : ''}
              {item.message}
            </span>
          </p>
        )
      })}
      {commitments.length > 0 && (
        <details className="pt-1 text-xs text-slate-600">
          <summary className="cursor-pointer font-medium">Scheduled commitments</summary>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            {commitments.map((commitment) => (
              <li key={commitment}>{commitment}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

export function PAHistory({ totalAssignments }: { totalAssignments: number }) {
  return (
    <details className="mt-2 text-xs text-slate-500">
      <summary className="cursor-pointer text-xs font-normal">Assignment history</summary>
      <p className="mt-1">{totalAssignments} lifetime assignments. Used to share work fairly.</p>
    </details>
  )
}
