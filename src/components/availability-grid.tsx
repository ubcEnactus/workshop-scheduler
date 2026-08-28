import type { ReactNode } from 'react'

import { SLOT_STARTS } from '@/lib/schemas/availability'
import { DAY_LABELS, DAY_LABELS_SHORT, formatSlotRange } from '@/lib/time'

type AvailabilityGridProps = {
  /** Keys of already-saved slots, as `${dayOfWeek}-${startMin}`. */
  checked: ReadonlySet<string>
  action: (formData: FormData) => Promise<void>
  /** Card heading, e.g. "Weekly availability". */
  title: string
  /** Caption under the heading. */
  subtitle: string
  /** One-line instruction above the grid. */
  helpText: string
  saved?: boolean
  error?: boolean
  /** Extra legend swatches appended after the standard Available/Not set pair. */
  legendExtra?: ReactNode
}

/**
 * Weekly availability picker (Mon–Fri x 30-minute school-hour slots), shared by
 * the PA and Teacher availability pages.
 *
 * Plain HTML form posting to the role's own `saveAvailability` Server Action.
 * Only checked boxes are submitted, so saving replaces the whole set — see
 * `replaceAvailability` in `lib/availability.ts`.
 */
export function AvailabilityGrid({
  checked,
  action,
  title,
  subtitle,
  helpText,
  saved,
  error,
  legendExtra,
}: AvailabilityGridProps) {
  return (
    <form action={action}>
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-400">{subtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            {saved && (
              <span
                role="status"
                className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700"
              >
                Saved
              </span>
            )}
            <span className="text-xs text-gray-400">{checked.size} slots selected</span>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
          >
            Couldn&apos;t save — try again.
          </div>
        )}

        <div className="mb-3 flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded bg-green-400" /> Available
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded bg-gray-200" /> Not set
          </span>
          {legendExtra}
        </div>

        <p className="mb-3 text-xs text-gray-400">{helpText}</p>

        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr>
                <th className="w-16 py-2 text-left text-xs font-medium text-gray-400" />
                {DAY_LABELS_SHORT.map((day) => (
                  <th
                    key={day}
                    className="w-1/5 py-2 text-center text-xs font-semibold text-gray-700"
                  >
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SLOT_STARTS.map((startMin) => (
                <tr key={startMin}>
                  <td className="py-0.5 pr-2 text-right text-[11px] text-gray-400 tabular-nums">
                    {formatSlotRange(startMin).split('–')[0].trim()}
                  </td>
                  {DAY_LABELS.map((dayLabel, dayOfWeek) => {
                    const key = `${dayOfWeek}-${startMin}`
                    return (
                      <td key={key} className="px-0.5 py-0.5">
                        <label className="block cursor-pointer">
                          <input
                            type="checkbox"
                            name="slots"
                            value={key}
                            defaultChecked={checked.has(key)}
                            aria-label={`${dayLabel} ${formatSlotRange(startMin)}`}
                            className="peer sr-only"
                          />
                          <div className="h-7 rounded bg-gray-100 transition-colors hover:bg-gray-200 peer-checked:bg-green-400 peer-checked:hover:bg-green-500 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500" />
                        </label>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-end gap-3">
          <button type="reset" className="text-sm font-medium text-gray-500 hover:text-gray-700">
            Clear all
          </button>
          <button
            type="submit"
            className="rounded-lg bg-[#1e2a4a] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a3a5e]"
          >
            Save availability
          </button>
        </div>
      </div>
    </form>
  )
}
