'use client'
import Link from 'next/link'
import { useState } from 'react'
import type { WorkshopWorkspacePA, WorkshopWorkspaceRow } from '@/lib/scheduling/workspace-view'
import { Button } from './ui/button'
import { PAWarnings, PAHistory } from './pa-warnings'

export function DraftSessionCard({
  row,
  disabled,
  selected,
  onSelect,
  onEdit,
  focused,
}: {
  row: WorkshopWorkspaceRow
  disabled: boolean
  selected: boolean
  onSelect: (checked: boolean) => void
  onEdit: (
    row: WorkshopWorkspaceRow,
    operation: 'assign' | 'remove' | 'keep' | 'lock' | 'unlock' | 'allow-pa',
    pa?: WorkshopWorkspacePA
  ) => void
  focused: boolean
}) {
  const [search, setSearch] = useState('')
  const candidates = row.candidates.filter((pa) =>
    pa.name.toLowerCase().includes(search.toLowerCase())
  )
  const assignable = candidates.filter((pa) => !pa.hardErrors.length)
  const unavailable = candidates.filter((pa) => pa.hardErrors.length)
  const deficit = Math.max(0, row.minPAs - row.assignments.length)
  return (
    <article
      id={`session-${row.id}`}
      className={`rounded-xl border bg-white p-4 ${focused ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            {deficit > 0 && !row.locked && (
              <input
                type="checkbox"
                className="size-5"
                disabled={disabled}
                checked={selected}
                onChange={(event) => onSelect(event.target.checked)}
                aria-label={`Auto-fill ${row.name} ${row.date}`}
              />
            )}
            <h3 className="font-semibold">{row.name}</h3>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {row.school} · {row.date}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {row.assignments.length} assigned · {row.minPAs} required
            {row.locked ? ' · Auto-fill off' : ''}
          </p>
        </div>
        <span
          className={`text-xs font-semibold ${row.problems.length ? 'text-amber-900' : 'text-emerald-800'}`}
        >
          {deficit
            ? `Needs ${deficit} PA${deficit === 1 ? '' : 's'}`
            : row.problems.length
              ? 'Review PA warnings'
              : 'Ready to publish'}
        </span>
      </div>
      {row.problems.filter((problem) => problem !== 'Minimum staffing is not met.').length > 0 && (
        <ul className="mt-3 list-disc pl-5 text-sm text-red-900">
          {row.problems
            .filter((problem) => problem !== 'Minimum staffing is not met.')
            .map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
        </ul>
      )}
      <ul className="mt-3 divide-y divide-slate-100">
        {row.assignments.map((pa) => (
          <li key={pa.id} className="py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{pa.name}</p>
                <PAWarnings {...pa} />
              </div>
              <div className="flex gap-2">
                {pa.canKeep && (
                  <Button size="sm" disabled={disabled} onClick={() => onEdit(row, 'keep', pa)}>
                    Keep {pa.name}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => onEdit(row, 'remove', pa)}
                >
                  Remove {pa.name}
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {!row.assignments.length && <p className="mt-3 text-sm text-slate-500">No PAs assigned.</p>}
      <details open={focused || undefined} className="mt-3 rounded-lg border border-slate-200">
        <summary className="cursor-pointer p-3 text-sm font-semibold">Add PA</summary>
        <div className="space-y-3 border-t border-slate-100 p-3">
          <label className="block text-sm">
            Search PAs for {row.name}
            <input
              type="search"
              className="input mt-1"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {assignable.map((pa) => (
            <div
              key={pa.id}
              role="group"
              aria-label={pa.name}
              className={`rounded-lg border p-3 ${pa.warnings.some((warning) => warning.code === 'SAME_DAY') ? 'border-red-200 bg-red-50' : pa.warnings.length || pa.availabilityWarnings.length ? 'border-amber-200 bg-amber-50' : 'border-slate-200'}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{pa.name}</p>
                </div>
                <Button
                  size="sm"
                  disabled={disabled || !!pa.hardErrors.length}
                  onClick={() => onEdit(row, 'assign', pa)}
                >
                  Assign {pa.name}
                </Button>
              </div>
              <PAWarnings {...pa} />
              <PAHistory totalAssignments={pa.totalAssignments} />
              {pa.excluded && (
                <div className="mt-2 text-xs text-slate-600">
                  <p>Excluded from auto-fill for this session.</p>
                  <Button
                    className="mt-1"
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => onEdit(row, 'allow-pa', pa)}
                  >
                    Allow auto-fill for {pa.name}
                  </Button>
                </div>
              )}
            </div>
          ))}
          {!assignable.length && (
            <p className="text-sm text-slate-600">No assignable PAs match your search.</p>
          )}
          {unavailable.length > 0 && (
            <details className="border-t border-slate-100 pt-3 text-sm">
              <summary className="cursor-pointer text-slate-600">
                Blocked PAs ({unavailable.length})
              </summary>
              <div className="mt-3 space-y-3">
                {unavailable.map((pa) => (
                  <div
                    key={pa.id}
                    role="group"
                    aria-label={pa.name}
                    className="rounded-lg border border-slate-200 p-3"
                  >
                    <p className="font-medium">{pa.name}</p>
                    <PAWarnings hardErrors={pa.hardErrors} />
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </details>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium text-slate-600">Session options</summary>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="w-full text-xs text-slate-500">
            Up to {row.maxPAs} PAs can join this session. Auto-fill adds only the {row.minPAs}{' '}
            required.
          </p>
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={() => onEdit(row, row.locked ? 'unlock' : 'lock')}
          >
            {row.locked ? 'Allow auto-fill' : 'Exclude session from auto-fill'}
          </Button>
          <Link
            href={`/admin/workshops/${row.id}`}
            aria-disabled={disabled || undefined}
            onClick={(event) => {
              if (disabled) event.preventDefault()
            }}
            className="underline"
          >
            Edit date and details
          </Link>
        </div>
      </details>
    </article>
  )
}
