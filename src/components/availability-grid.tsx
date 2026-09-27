'use client'
import { ReadyFields } from './ready-fields'
import { useActionState, useState } from 'react'
import { SubmitButton } from '@/components/submit-button'
import { Button } from '@/components/ui/button'
import { SLOT_STARTS, DAY_END_MIN, SLOT_MINUTES } from '@/lib/schemas/availability'
import { DAY_LABELS, formatSlotRange } from '@/lib/time'
import { addAvailabilityRange, copyAvailabilityDays } from '@/lib/availability-editor'
import { coalesceAvailability } from '@/lib/scheduling/availability'

export function AvailabilityGrid({
  checked,
  action,
  effectiveFrom,
  expectedRevision,
  minimumEffectiveFrom,
  exceptions,
  exceptionAction,
  removeExceptionAction,
  saved,
  error,
}: {
  checked: ReadonlySet<string>
  action: (state: { error?: string }, form: FormData) => Promise<{ error?: string }>
  effectiveFrom: string
  expectedRevision?: string
  minimumEffectiveFrom: string
  exceptions: {
    id: string
    date: string
    kind: 'AVAILABLE' | 'UNAVAILABLE'
    startMinute: number | null
    endMinute: number | null
    notes: string | null
  }[]
  exceptionAction: (
    state: { error?: string; saved?: boolean },
    form: FormData
  ) => Promise<{ error?: string; saved?: boolean }>
  removeExceptionAction: (state: { error?: string }, form: FormData) => Promise<{ error?: string }>
  saved?: boolean
  error?: boolean
}) {
  const [slots, setSlots] = useState(new Set(checked))
  const [day, setDay] = useState(0)
  const [start, setStart] = useState(540),
    [end, setEnd] = useState(720)
  const [days, setDays] = useState<number[]>([])
  const [undo, setUndo] = useState<Set<string> | null>(null)
  const [notice, setNotice] = useState(''),
    [rangeError, setRangeError] = useState('')
  const [state, formAction, pending] = useActionState(action, {})
  const dirty = [...slots].sort().join(',') !== [...checked].sort().join(',')
  const windows = coalesceAvailability(
    [...slots].map((key) => {
      const [dayOfWeek, startMin] = key.split('-').map(Number)
      return { userId: 'current', dayOfWeek, startMin }
    })
  )
  function update(next: Set<string>, message: string) {
    setUndo(new Set(slots))
    setSlots(next)
    setNotice(message)
    setRangeError('')
  }
  function clock(minutes: number) {
    return (
      String(Math.floor(minutes / 60)).padStart(2, '0') +
      ':' +
      String(minutes % 60).padStart(2, '0')
    )
  }
  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        {expectedRevision && <input type="hidden" name="expectedRevision" value={expectedRevision} />}
        <ReadyFields disabled={pending}>
          <p className="text-sm text-slate-600">
            {(slots.size * SLOT_MINUTES) / 60} hours per week ·{' '}
            {new Set([...slots].map((s) => s.split('-')[0])).size} weekdays · Vancouver time
          </p>
          <label className="field max-w-sm">
            This weekly schedule takes effect
            <input
              className="input"
              type="date"
              name="effectiveFrom"
              min={minimumEffectiveFrom}
              defaultValue={effectiveFrom}
              required
            />
            <span className="text-xs font-normal text-slate-600">
              Choose a future date to save a change without rewriting earlier availability.
            </span>
          </label>
          {saved && !dirty && (
            <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              Availability saved.
            </p>
          )}
          {(error || state.error) && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {state.error ?? 'Could not save availability. Check your entries and try again.'}
            </p>
          )}
          <section
            aria-label="Availability editor"
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
          >
            <div className="flex flex-wrap gap-2" aria-label="Choose weekday">
              {DAY_LABELS.map((label, i) => (
                <Button
                  key={label}
                  type="button"
                  size="sm"
                  variant={day === i ? 'primary' : 'secondary'}
                  aria-pressed={day === i}
                  onClick={() => {
                    setDay(i)
                    setDays([])
                    setRangeError('')
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
            <h2 className="font-semibold">{DAY_LABELS[day]} availability</h2>
            <ul className="space-y-2">
              {windows
                .filter((w) => w.dayOfWeek === day)
                .map((w) => (
                  <li
                    key={w.startMinute}
                    className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-3"
                  >
                    <span>{formatSlotRange(w.startMinute, w.endMinute - w.startMinute)}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      aria-label={
                        'Remove ' +
                        DAY_LABELS[day] +
                        ' ' +
                        formatSlotRange(w.startMinute, w.endMinute - w.startMinute)
                      }
                      onClick={() =>
                        update(
                          new Set(
                            [...slots].filter((s) => {
                              const [d, m] = s.split('-').map(Number)
                              return d !== day || m < w.startMinute || m >= w.endMinute
                            })
                          ),
                          'Time range removed. You can undo before saving.'
                        )
                      }
                    >
                      Remove
                    </Button>
                  </li>
                ))}
            </ul>
            {!windows.some((w) => w.dayOfWeek === day) && (
              <p className="text-sm text-slate-500">No availability on {DAY_LABELS[day]}.</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className="field">
                From
                <select
                  aria-label="From"
                  className="input"
                  value={start}
                  onChange={(e) => setStart(Number(e.target.value))}
                >
                  {SLOT_STARTS.map((m) => (
                    <option key={m} value={m}>
                      {clock(m)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Until
                <select
                  aria-label="Until"
                  className="input"
                  value={end}
                  onChange={(e) => setEnd(Number(e.target.value))}
                >
                  {[...SLOT_STARTS.slice(1), DAY_END_MIN].map((m) => (
                    <option key={m} value={m}>
                      {clock(m)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                try {
                  update(
                    addAvailabilityRange(slots, day, start, end),
                    'Time range added. Save when ready.'
                  )
                } catch (err) {
                  setRangeError(err instanceof Error ? err.message : 'Invalid range.')
                }
              }}
            >
              Add time range
            </Button>
            {rangeError && (
              <p role="alert" className="text-sm text-red-800">
                {rangeError}
              </p>
            )}
            <fieldset className="space-y-3 border-t border-slate-100 pt-4">
              <legend className="text-sm font-semibold">
                Copy {DAY_LABELS[day]} to other days
              </legend>
              <p className="text-xs text-slate-600">
                Adds these times to the selected days. Existing times are kept and overlaps are
                merged.
              </p>
              <div className="flex flex-wrap gap-4">
                {DAY_LABELS.map(
                  (label, i) =>
                    i !== day && (
                      <label key={label} className="flex min-h-10 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-5"
                          checked={days.includes(i)}
                          onChange={(e) =>
                            setDays(e.target.checked ? [...days, i] : days.filter((d) => d !== i))
                          }
                        />
                        {label}
                      </label>
                    )
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending || !days.length || !windows.some((w) => w.dayOfWeek === day)}
                onClick={() =>
                  update(
                    copyAvailabilityDays(slots, day, days),
                    'Availability copied. Review the days before saving.'
                  )
                }
              >
                Copy to selected days
              </Button>
            </fieldset>
            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  update(
                    new Set([...slots].filter((s) => !s.startsWith(day + '-'))),
                    'Day cleared. You can undo before saving.'
                  )
                }
              >
                Clear this day
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  update(new Set(), 'All days cleared. Save to clear your availability.')
                }
              >
                Clear all
              </Button>
              {undo && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    setSlots(undo)
                    setUndo(null)
                    setNotice('Last edit undone.')
                  }}
                >
                  Undo last edit
                </Button>
              )}
            </div>
            {notice && (
              <p role="status" className="text-sm text-slate-600">
                {notice}
              </p>
            )}
          </section>
          <details className="rounded-xl border border-slate-200 bg-white p-4">
            <summary className="cursor-pointer text-sm font-semibold">
              Edit individual 15-minute slots
            </summary>
            <p className="my-3 text-xs text-slate-600">
              Optional full-week grid. Scroll sideways on small screens.
            </p>
            <div className="table-scroll">
              <table className="w-full min-w-[680px] text-sm">
                <caption className="sr-only">
                  Recurring weekly availability in 15-minute slots
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    {DAY_LABELS.map((d) => (
                      <th scope="col" key={d}>
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SLOT_STARTS.map((m) => (
                    <tr key={m}>
                      <th scope="row" className="p-2 text-xs">
                        {formatSlotRange(m, SLOT_MINUTES)}
                      </th>
                      {DAY_LABELS.map((d, i) => {
                        const key = i + '-' + m
                        return (
                          <td key={key} className="p-2 text-center">
                            <input
                              type="checkbox"
                              name="slots"
                              value={key}
                              aria-label={d + ' ' + formatSlotRange(m, SLOT_MINUTES)}
                              checked={slots.has(key)}
                              onChange={(e) => {
                                const next = new Set(slots)
                                if (e.target.checked) next.add(key)
                                else next.delete(key)
                                update(next, 'Availability updated.')
                              }}
                              className="size-6 accent-[#1e2a4a]"
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="text-sm text-slate-600">
              {dirty ? 'Unsaved changes' : 'No unsaved changes'} ·{' '}
              {(slots.size * SLOT_MINUTES) / 60} hours
            </span>
            <SubmitButton>Save availability</SubmitButton>
          </div>
        </ReadyFields>
      </form>
      <AvailabilityExceptions
        effectiveFrom={minimumEffectiveFrom}
        exceptions={exceptions}
        action={exceptionAction}
        removeAction={removeExceptionAction}
      />
    </div>
  )
}

function AvailabilityExceptions({
  effectiveFrom,
  exceptions,
  action,
  removeAction,
}: {
  effectiveFrom: string
  exceptions: {
    id: string
    date: string
    kind: 'AVAILABLE' | 'UNAVAILABLE'
    startMinute: number | null
    endMinute: number | null
    notes: string | null
  }[]
  action: (
    state: { error?: string; saved?: boolean },
    form: FormData
  ) => Promise<{ error?: string; saved?: boolean }>
  removeAction: (state: { error?: string }, form: FormData) => Promise<{ error?: string }>
}) {
  const [state, formAction, pending] = useActionState(action, {})
  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <div>
        <h2 className="font-semibold">One-off availability exceptions</h2>
        <p className="mt-1 text-sm text-slate-600">
          Add time for one date or mark a date or time unavailable. An exception never changes an
          existing assignment; admins review any conflict.
        </p>
      </div>
      {exceptions.length ? (
        <ul className="space-y-2">
          {exceptions.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 text-sm"
            >
              <span>
                <strong>{item.date}</strong> ·{' '}
                {item.kind === 'AVAILABLE' ? 'Available' : 'Unavailable'} ·{' '}
                {item.startMinute == null || item.endMinute == null
                  ? 'All day'
                  : formatSlotRange(item.startMinute, item.endMinute - item.startMinute)}
                {item.notes ? ` · ${item.notes}` : ''}
              </span>
              <RemoveException id={item.id} action={removeAction} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">No future exceptions saved.</p>
      )}
      <form action={formAction} className="space-y-3 border-t border-slate-100 pt-4">
        <ReadyFields disabled={pending}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field">
              Date
              <input
                className="input"
                type="date"
                name="date"
                min={effectiveFrom}
                defaultValue={effectiveFrom}
                required
              />
            </label>
            <label className="field">
              Exception
              <select className="input" name="kind" defaultValue="UNAVAILABLE">
                <option value="UNAVAILABLE">Unavailable</option>
                <option value="AVAILABLE">Additional availability</option>
              </select>
            </label>
            <label className="field">
              From (blank for all day unavailable)
              <input className="input" type="time" name="startTime" step={900} />
            </label>
            <label className="field">
              Until
              <input className="input" type="time" name="endTime" step={900} />
            </label>
          </div>
          <label className="field">
            Note (optional)
            <input className="input" name="notes" maxLength={500} />
          </label>
          {state.error && (
            <p role="alert" className="text-sm text-red-800">
              {state.error}
            </p>
          )}
          {state.saved && (
            <p role="status" className="text-sm text-emerald-800">
              Exception saved.
            </p>
          )}
          <SubmitButton size="sm">Add exception</SubmitButton>
        </ReadyFields>
      </form>
    </section>
  )
}

function RemoveException({
  id,
  action,
}: {
  id: string
  action: (state: { error?: string }, form: FormData) => Promise<{ error?: string }>
}) {
  const [state, formAction, pending] = useActionState(action, {})
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        Remove
      </Button>
      {state.error && (
        <p role="alert" className="mt-1 text-xs text-red-800">
          {state.error}
        </p>
      )}
    </form>
  )
}
