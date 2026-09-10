import { Check, Clock3, Info } from 'lucide-react'

import { SubmitButton } from '@/components/submit-button'
import { Panel } from '@/components/ui/panel'
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
 * Weekly availability checkbox grid (Mon–Fri × 30-minute school-hour slots).
 * Only checked boxes are submitted, so saving replaces the complete saved set.
 */
export function AvailabilityGrid({ checked, action, saved, error }: AvailabilityGridProps) {
  return (
    <form action={action} className="w-full max-w-full min-w-0">
      <Panel
        title="Weekly availability"
        description="Select every 30-minute block when you are available. All times are Pacific (Vancouver)."
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            <Clock3 className="size-3.5" aria-hidden="true" />
            {checked.size} saved {checked.size === 1 ? 'slot' : 'slots'}
          </span>
        }
      >
        {saved ? (
          <div
            role="status"
            className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
          >
            <Check className="size-4 shrink-0" aria-hidden="true" />
            Availability saved.
          </div>
        ) : null}
        {error ? (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            Couldn&apos;t save availability — the submission was invalid. Try again.
          </div>
        ) : null}

        <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600">
          <span className="flex items-center gap-2">
            <span
              className="size-3 rounded border border-[#1e2a4a] bg-[#1e2a4a]"
              aria-hidden="true"
            />
            Available
          </span>
          <span className="flex items-center gap-2">
            <span className="size-3 rounded border border-slate-300 bg-white" aria-hidden="true" />
            Not available
          </span>
          <span className="flex items-center gap-1.5 text-slate-500">
            <Info className="size-3.5" aria-hidden="true" />
            You can change and save this schedule at any time.
          </span>
        </div>

        <p className="mb-2 text-xs font-medium text-slate-600 sm:hidden">
          Scroll horizontally to see the full week.
        </p>
        <div className="table-scroll w-full min-w-0 border border-slate-200">
          <table className="w-full min-w-[680px] table-fixed border-collapse text-sm">
            <caption className="sr-only">Recurring weekly availability in 30-minute slots</caption>
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200">
                <th
                  scope="col"
                  className="w-36 px-4 py-3 text-left text-xs font-semibold text-slate-500"
                >
                  Time
                </th>
                {DAY_LABELS.map((day) => (
                  <th
                    scope="col"
                    key={day}
                    className="px-2 py-3 text-center text-xs font-semibold text-slate-700"
                  >
                    {day.slice(0, 3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SLOT_STARTS.map((startMin) => (
                <tr key={startMin} className="border-b border-slate-100 last:border-b-0">
                  <th
                    scope="row"
                    className="bg-slate-50/60 px-4 py-2 text-left text-xs font-medium whitespace-nowrap text-slate-600 tabular-nums"
                  >
                    {formatSlotRange(startMin)}
                  </th>
                  {DAY_LABELS.map((day, dayOfWeek) => {
                    const key = `${dayOfWeek}-${startMin}`
                    return (
                      <td key={key} className="p-1 text-center">
                        <label className="group flex min-h-10 cursor-pointer items-center justify-center rounded-md hover:bg-slate-50">
                          <input
                            type="checkbox"
                            name="slots"
                            value={key}
                            defaultChecked={checked.has(key)}
                            aria-label={`${day} ${formatSlotRange(startMin)}`}
                            className="size-6 rounded border-slate-300 accent-[#1e2a4a]"
                          />
                        </label>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-xs leading-5 text-slate-500">
            Only checked slots are kept. Unchecking every slot and saving clears your availability.
          </p>
          <SubmitButton>Save availability</SubmitButton>
        </div>
      </Panel>
    </form>
  )
}
