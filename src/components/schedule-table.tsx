'use client'
import Link from 'next/link'
import { schedulingHref, type SchedulingContext } from '@/lib/scheduling/navigation'
import type { WorkspaceRow } from './workspace-schedule'
import { Button } from './ui/button'
import { StatusBadge } from './ui/status-badge'

/** Session browsing and selection; drawer state and mutations stay in the workspace. */
export function ScheduleTable({
  displayRows,
  context,
  selected,
  blocked,
  onSelect,
  onStaff,
}: {
  displayRows: WorkspaceRow[]
  context: SchedulingContext
  selected: string[]
  blocked: boolean
  onSelect: (id: string, checked: boolean) => void
  onStaff: (id: string, trigger: HTMLButtonElement) => void
}) {
  return !displayRows.some((r) => r.visible) ? (
    <div className="empty-state">
      <p>
        No teacher sessions {context.workshopDefinitionId ? 'in this workshop' : 'in this month'}{' '}
        for these filters.
      </p>
      <Link className="underline" href={schedulingHref('/admin/workshops/plan', context)}>
        Choose teacher dates
      </Link>
      <Link
        className="underline"
        href={schedulingHref('/admin/workshops', {
          month: context.month,
          workshopDefinitionId: context.workshopDefinitionId,
        })}
      >
        Reset filters
      </Link>
    </div>
  ) : (
    <table className="block w-full border-collapse text-left text-sm md:table">
      <caption className="sr-only">
        Teacher sessions{' '}
        {context.workshopDefinitionId ? 'for this workshop' : `for ${context.month}`},
        America/Vancouver
      </caption>
      <thead className="hidden bg-slate-50 text-xs text-slate-600 md:table-header-group">
        <tr>
          <th className="p-3">Publish</th>
          <th className="p-3">Teacher and school</th>
          <th className="p-3">Vancouver date/time</th>
          <th className="p-3">Staffing</th>
          <th className="p-3">Status</th>
          <th className="p-3">Actions</th>
        </tr>
      </thead>
      <tbody className="block md:table-row-group">
        {displayRows
          .filter((r) => r.visible)
          .map((row) => (
            <tr
              key={row.id}
              className="grid gap-2 border-t border-slate-100 p-4 md:table-row md:p-0"
            >
              <td className="md:p-3">
                {row.status === 'DRAFT' && (
                  <label className="flex min-h-9 items-center gap-2">
                    <input
                      type="checkbox"
                      disabled={blocked}
                      className="size-5 accent-[#1e2a4a]"
                      aria-label={'Select ' + row.name + ' ' + row.date + ' for publication'}
                      checked={selected.includes(row.id)}
                      onChange={(event) => onSelect(row.id, event.target.checked)}
                    />
                    <span className="text-xs md:hidden">Select for publication</span>
                  </label>
                )}
              </td>
              <td className="md:p-3">
                <Link
                  className="font-semibold underline-offset-2 hover:underline"
                  href={schedulingHref('/admin/workshops/' + row.id, context)}
                >
                  {row.name}
                </Link>
                {row.definitionTitle && (
                  <p className="mt-1 text-xs text-slate-500">{row.definitionTitle}</p>
                )}
                <p className="text-xs text-slate-600">{row.school}</p>
              </td>
              <td className="md:p-3">{row.date}</td>
              <td className="md:p-3">
                <p>{row.assignments.map((a) => a.name).join(', ') || 'No PAs assigned'}</p>
                <p className="text-xs text-slate-600">
                  {row.assignments.length} / {row.minPAs}–{row.maxPAs} PAs
                </p>
              </td>
              <td className="md:p-3">
                <StatusBadge status={row.status} />
                {row.locked && row.status === 'DRAFT' && (
                  <p className="mt-1 text-xs text-slate-600">Auto-fill off</p>
                )}
                {row.problems.length > 0 &&
                  row.status !== 'CANCELLED' &&
                  row.status !== 'COMPLETED' && (
                    <p className="mt-1 text-xs text-amber-800">
                      {row.status === 'DRAFT' ? 'Needs staffing review' : 'Needs review'}
                    </p>
                  )}
              </td>
              <td className="md:p-3">
                {row.status === 'DRAFT' ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={blocked}
                    onClick={(event) => onStaff(row.id, event.currentTarget)}
                  >
                    Staff {row.name}
                  </Button>
                ) : (
                  <Link
                    className="text-sm font-semibold underline"
                    href={schedulingHref('/admin/workshops/' + row.id, context)}
                  >
                    Details
                  </Link>
                )}
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  )
}
