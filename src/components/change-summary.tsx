import { auditStateSchema } from '@/lib/schemas/changes'
import { formatInstantRange } from '@/lib/time'
export function ChangeSummary({ before, after }: { before: unknown; after: unknown }) {
  const states = [
    ['Before', auditStateSchema.parse(before)],
    ['After', auditStateSchema.parse(after)],
  ] as const
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {states.map(([label, state]) => (
        <div className="rounded border p-3" key={label}>
          <p className="font-medium">
            {label}: {state.status.toLowerCase()}
          </p>
          <p>{formatInstantRange(new Date(state.start), new Date(state.end))}</p>
          <p>PAs: {state.pas.map((p) => p.name).join(', ') || 'None'}</p>
        </div>
      ))}
    </div>
  )
}
