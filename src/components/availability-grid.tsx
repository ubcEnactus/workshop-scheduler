import { Button } from '@/components/ui/button'
import { SLOT_STARTS } from '@/lib/schemas/availability'
import { DAY_LABELS, formatSlotRange } from '@/lib/time'

type AvailabilityGridProps = {
  /** Keys of already-saved slots, as `${dayOfWeek}-${startMin}`. */
  checked: ReadonlySet<string>
  action: (formData: FormData) => Promise<void>
  saved?: boolean
  error?: boolean
}

/**
 * Weekly availability checkbox grid (Mon–Fri × 30-min school-hour slots).
 * Plain HTML form posting to the role's `saveAvailability` action — only
 * checked boxes are submitted, so saving replaces the whole set.
 */
export function AvailabilityGrid({ checked, action, saved, error }: AvailabilityGridProps) {
  return (
    <form action={action}>
      {saved ? (
        <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
          Availability saved.
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          Couldn&apos;t save availability — the submission was invalid. Try again.
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th className="px-3 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">
                Time
              </th>
              {DAY_LABELS.map((day) => (
                <th key={day} className="px-3 py-2 text-center font-medium">
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SLOT_STARTS.map((startMin) => (
              <tr
                key={startMin}
                className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800/60"
              >
                <td className="px-3 py-1.5 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                  {formatSlotRange(startMin)}
                </td>
                {DAY_LABELS.map((day, dayOfWeek) => (
                  <td key={day} className="px-3 py-1.5 text-center">
                    <input
                      type="checkbox"
                      name="slots"
                      value={`${dayOfWeek}-${startMin}`}
                      defaultChecked={checked.has(`${dayOfWeek}-${startMin}`)}
                      aria-label={`${day} ${formatSlotRange(startMin)}`}
                      className="size-4 accent-zinc-900 dark:accent-zinc-100"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <Button type="submit">Save availability</Button>
        <p className="text-xs text-zinc-500">
          Only checked slots are kept — unchecking everything clears your availability.
        </p>
      </div>
    </form>
  )
}
