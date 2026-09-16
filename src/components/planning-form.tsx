'use client'
import { ReadyFields } from './ready-fields'
import { useActionState, useState } from 'react'
import Link from 'next/link'
import { createWorkshopBatchForm } from '@/app/admin/workshops/plan/actions'
import { suggestedSlots } from '@/lib/scheduling/date-suggestions'
import { schedulingHref, type SchedulingContext } from '@/lib/scheduling/navigation'
import { DAY_LABELS, formatSlotRange } from '@/lib/time'
import { SubmitButton } from './submit-button'
import type { WorkshopClass } from './workshop-form'
export function PlanningForm({
  context,
  requestKey,
  rows,
}: {
  context: SchedulingContext
  requestKey: string
  rows: { cls: WorkshopClass; index: number }[]
}) {
  const [values, setValues] = useState(
    rows.map((r) => ({
      date: '',
      startTime: '',
      durationMinutes: String(r.cls.defaultDurationMinutes),
      minPAs: String(r.cls.defaultMinPAs),
      maxPAs: String(r.cls.defaultMaxPAs),
    }))
  )
  const [state, action, pending] = useActionState(createWorkshopBatchForm, {})
  return (
    <form action={action} className="space-y-4">
      <ReadyFields disabled={pending}>
        <input type="hidden" name="requestKey" value={requestKey} />
        <input type="hidden" name="month" value={context.month} />
        <input type="hidden" name="schoolId" value={context.schoolId ?? ''} />
        <input type="hidden" name="returnClassSectionId" value={context.classSectionId ?? ''} />
        <input type="hidden" name="view" value={context.view ?? ''} />
        {state.error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {state.error} All your entries have been kept.
          </p>
        )}
        {rows.map(({ cls, index }, row) => {
          const suggestions = suggestedSlots(
            cls,
            context.month,
            Number(values[row].durationMinutes)
          )
          return (
            <fieldset
              key={cls.id + ':' + index}
              className="space-y-3 rounded-lg border border-slate-200 p-4"
            >
              <legend className="px-2 text-sm font-semibold">
                {cls.name} · occurrence {index + 1}
              </legend>
              <input type="hidden" name="classSectionId" value={cls.id} />
              <p className="text-xs text-slate-600">
                {cls.meetings
                  .map(
                    (m) =>
                      DAY_LABELS[m.dayOfWeek] +
                      ' ' +
                      formatSlotRange(m.startMinute, m.endMinute - m.startMinute)
                  )
                  .join('; ')}
              </p>
              <label className="field">
                Suggested date and time
                <select
                  aria-label="Suggested date and time"
                  className="input"
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return
                    const slot = suggestions[Number(e.target.value)]
                    if (slot)
                      setValues(
                        values.map((v, i) =>
                          i === row ? { ...v, date: slot.date, startTime: slot.startTime } : v
                        )
                      )
                  }}
                >
                  <option value="">Choose a suggested slot…</option>
                  {suggestions.map((s, i) => (
                    <option key={s.date + s.startTime} value={i}>
                      {s.date} · {s.startTime}–{s.endTime}
                    </option>
                  ))}
                </select>
              </label>
              {!suggestions.length && (
                <p className="text-sm text-amber-800">
                  No suitable slots.{' '}
                  <Link
                    className="underline"
                    href={schedulingHref('/admin/classes/' + cls.id + '/edit', context)}
                  >
                    Review class availability
                  </Link>
                  .
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    { key: 'date', label: 'Vancouver date', type: 'date' },
                    { key: 'startTime', label: 'Start time', type: 'time' },
                    { key: 'durationMinutes', label: 'Duration (minutes)', type: 'number' },
                    { key: 'minPAs', label: 'Minimum PAs', type: 'number' },
                    { key: 'maxPAs', label: 'Maximum PAs', type: 'number' },
                  ] as const
                ).map((f) => (
                  <label className="field" key={f.key}>
                    {f.label}
                    <input
                      aria-label={f.label}
                      id={
                        f.key === 'date'
                          ? 'date-' + row
                          : f.key === 'startTime'
                            ? 'time-' + row
                            : undefined
                      }
                      type={f.type}
                      name={f.key}
                      className="input"
                      required
                      min={
                        f.type === 'number'
                          ? '1'
                          : f.type === 'date'
                            ? context.month + '-01'
                            : undefined
                      }
                      value={values[row][f.key]}
                      onChange={(e) =>
                        setValues(
                          values.map((v, i) => (i === row ? { ...v, [f.key]: e.target.value } : v))
                        )
                      }
                      aria-invalid={!!state.fields?.['slots.' + row + '.' + f.key]}
                    />
                    {state.fields?.['slots.' + row + '.' + f.key] && (
                      <span className="text-xs text-red-800">
                        {state.fields['slots.' + row + '.' + f.key]}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </fieldset>
          )
        })}
        <p className="text-xs text-slate-600">
          Choose each date explicitly. Suggestions use recorded availability; confirm holidays
          separately. All workshops are validated and saved together.
        </p>
        <SubmitButton>Create planned workshops</SubmitButton>
      </ReadyFields>
    </form>
  )
}
