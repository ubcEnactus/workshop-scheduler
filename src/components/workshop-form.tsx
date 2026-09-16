'use client'
import { ReadyFields } from './ready-fields'
import Link from 'next/link'
import { useActionState, useState } from 'react'
import { SubmitButton } from '@/components/submit-button'
import { DAY_LABELS, formatSlotRange } from '@/lib/time'
import { suggestedSlots } from '@/lib/scheduling/date-suggestions'
import { schedulingHref, type SchedulingContext } from '@/lib/scheduling/navigation'
import type { WorkshopFormState } from '@/lib/schemas/form-state'
export type WorkshopClass = {
  id: string
  name: string
  school: { name: string }
  teacher: { name: string | null; email: string }
  meetings: { dayOfWeek: number; startMinute: number; endMinute: number }[]
  defaultDurationMinutes: number
  defaultMinPAs: number
  defaultMaxPAs: number
  busy?: { start: string; end: string }[]
}
type Values = {
  classSectionId: string
  date: string
  startTime: string
  endTime: string
  minPAs: string
  maxPAs: string
}
export function WorkshopForm({
  action,
  classes,
  month,
  context,
  initial,
}: {
  action: (state: WorkshopFormState, form: FormData) => Promise<WorkshopFormState>
  classes: WorkshopClass[]
  month: string
  context?: SchedulingContext
  initial?: {
    id: string
    version: number
    classSectionId: string
    date: string
    startTime: string
    endTime: string
    minPAs: number
    maxPAs: number
  }
}) {
  const selected = classes.find(
    (c) => c.id === (initial?.classSectionId ?? context?.classSectionId)
  )
  const [values, setValues] = useState<Values>({
    classSectionId: initial?.classSectionId ?? selected?.id ?? '',
    date: initial?.date ?? '',
    startTime: initial?.startTime ?? '',
    endTime: initial?.endTime ?? '',
    minPAs: String(initial?.minPAs ?? selected?.defaultMinPAs ?? 1),
    maxPAs: String(initial?.maxPAs ?? selected?.defaultMaxPAs ?? 3),
  })
  const [duration, setDuration] = useState(String(selected?.defaultDurationMinutes ?? 60))
  const [touched, setTouched] = useState<Set<string>>(
    new Set(initial ? ['date', 'startTime', 'endTime', 'minPAs', 'maxPAs', 'duration'] : [])
  )
  const [notice, setNotice] = useState('')
  const [state, formAction, pending] = useActionState(action, {})
  const cls = classes.find((c) => c.id === values.classSectionId)
  const options = cls ? suggestedSlots(cls, month, Number(duration)) : []
  function change(key: keyof Values, value: string) {
    setTouched(new Set([...touched, key]))
    setValues({ ...values, [key]: value })
  }
  return (
    <form action={formAction} className="space-y-4">
      <ReadyFields disabled={pending}>
        <input type="hidden" name="month" value={context?.month ?? month} />
        {context?.schoolId && <input type="hidden" name="schoolId" value={context.schoolId} />}
        <input type="hidden" name="returnClassSectionId" value={context?.classSectionId ?? ''} />
        {context?.view && <input type="hidden" name="view" value={context.view} />}{' '}
        {initial && (
          <>
            <input type="hidden" name="id" value={initial.id} />
            <input type="hidden" name="version" value={initial.version} />
          </>
        )}
        {state.error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {state.error} Your entries have been kept.
          </p>
        )}
        <label className="field">
          Class
          <select
            aria-label="Class"
            className="input"
            name="classSectionId"
            required
            value={values.classSectionId}
            onChange={(e) => {
              const next = classes.find((c) => c.id === e.target.value)
              setValues({
                ...values,
                classSectionId: e.target.value,
                minPAs: touched.has('minPAs') ? values.minPAs : String(next?.defaultMinPAs ?? 1),
                maxPAs: touched.has('maxPAs') ? values.maxPAs : String(next?.defaultMaxPAs ?? 3),
              })
              if (!touched.has('duration')) setDuration(String(next?.defaultDurationMinutes ?? 60))
              setNotice(
                'Class selected. Any dates and times you entered have been kept; check them against this class’s availability.'
              )
            }}
          >
            <option value="">Select a class…</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.school.name} · {c.teacher.name ?? c.teacher.email}
              </option>
            ))}
          </select>
        </label>
        {cls && (
          <div className="space-y-3 rounded-lg bg-slate-50 p-4">
            <p className="text-sm font-medium">
              Class availability:{' '}
              {cls.meetings
                .map(
                  (m) =>
                    DAY_LABELS[m.dayOfWeek] +
                    ' ' +
                    formatSlotRange(m.startMinute, m.endMinute - m.startMinute)
                )
                .join('; ') || 'No availability recorded.'}
            </p>
            <label className="field max-w-xs">
              Suggested duration (minutes)
              <input
                className="input"
                type="number"
                min="1"
                max="1440"
                value={duration}
                onChange={(e) => {
                  setDuration(e.target.value)
                  setTouched(new Set([...touched, 'duration']))
                }}
              />
            </label>
            <label className="field">
              Suggested date and time
              <select
                aria-label="Suggested date and time"
                className="input"
                value=""
                onChange={(e) => {
                  if (!e.target.value) return
                  const slot = options[Number(e.target.value)]
                  if (slot) {
                    setValues({ ...values, ...slot })
                    setTouched(new Set([...touched, 'date', 'startTime', 'endTime']))
                    setNotice('Date and time selected. Review before saving.')
                  }
                }}
              >
                <option value="">Choose a suggested slot…</option>
                {options.map((s, i) => (
                  <option key={s.date + s.startTime} value={i}>
                    {s.date} · {s.startTime}–{s.endTime}
                  </option>
                ))}
              </select>
            </label>
            {!options.length && (
              <p className="text-sm text-amber-800">
                No suitable slots for this duration in {month}.{' '}
                <Link
                  className="underline"
                  href={schedulingHref('/admin/classes/' + cls.id + '/edit', context ?? { month })}
                >
                  Review class availability
                </Link>
                .
              </p>
            )}
            <p className="text-xs text-slate-500">
              Suggestions use recorded availability and existing workshops. Confirm school holidays
              separately.
            </p>
          </div>
        )}
        {notice && (
          <p role="status" className="text-xs text-slate-600">
            {notice}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          {(
            [
              { key: 'date', label: 'Vancouver date', type: 'date' },
              { key: 'startTime', label: 'Start time', type: 'time' },
              { key: 'endTime', label: 'End time', type: 'time' },
              { key: 'minPAs', label: 'Minimum PAs', type: 'number' },
              { key: 'maxPAs', label: 'Maximum PAs', type: 'number' },
            ] as const
          ).map((field) => (
            <label key={field.key} className="field">
              {field.label}
              <input
                aria-label={field.label}
                className="input"
                name={field.key}
                type={field.type}
                min={field.type === 'number' ? '1' : undefined}
                required
                value={values[field.key]}
                onChange={(e) => change(field.key, e.target.value)}
                aria-invalid={!!state.fields?.[field.key]}
                aria-describedby={
                  state.fields?.[field.key] ? 'workshop-error-' + field.key : undefined
                }
              />
              {state.fields?.[field.key] && (
                <span id={'workshop-error-' + field.key} className="text-xs text-red-800">
                  {state.fields[field.key]}
                </span>
              )}
            </label>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Vancouver time. The full workshop must fit within one class availability block. Saving
          creates or updates a private draft.
        </p>
        {classes.length ? (
          <SubmitButton>{initial ? 'Save draft' : 'Create draft'}</SubmitButton>
        ) : (
          <p className="text-sm text-amber-800">
            Add an active class and its availability before creating a workshop.
          </p>
        )}
      </ReadyFields>
    </form>
  )
}
