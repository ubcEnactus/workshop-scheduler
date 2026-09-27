import type { ReactNode } from 'react'
import { PAHistory, PAWarnings } from './pa-warnings'

/** Keep warnings visible while allowing an admin to assign directly. */
export function OverrideCandidate({
  name,
  totalAssignments,
  warnings,
  availabilityWarnings = [],
  children,
}: {
  name: string
  totalAssignments: number
  warnings: { code: 'SAME_DAY' | 'SAME_WEEK'; message: string; commitments: string[] }[]
  availabilityWarnings?: string[]
  children: ReactNode
}) {
  const sameDay = warnings.some((warning) => warning.code === 'SAME_DAY')
  return (
    <div
      role="group"
      aria-label={name}
      className={`rounded-lg border p-3 ${sameDay ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium break-words">{name}</p>
        </div>
        {children}
      </div>
      <PAWarnings availabilityWarnings={availabilityWarnings} warnings={warnings} />
      <PAHistory totalAssignments={totalAssignments} />
    </div>
  )
}
