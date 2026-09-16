'use client'
import { ReadyFields } from './ready-fields'
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createWorkshopBatchForm } from '@/app/admin/workshops/plan/actions'
import { suggestedSlots } from '@/lib/scheduling/date-suggestions'
import type { SchedulingContext } from '@/lib/scheduling/navigation'
import { DAY_LABELS, formatSlotRange } from '@/lib/time'
import { SubmitButton } from './submit-button'
import type { WorkshopClass } from './workshop-form'
import { classEditPlanningHref } from '@/lib/scheduling/planning-return'

type PlanningValues = {
  date: string
  startTime: string
  durationMinutes: string
  minPAs: string
  maxPAs: string
}

type StoredPlanningDraft = {
  createdAt: number
  month: string
  selectedClassIds: string[]
  rows: Record<string, PlanningValues>
}

const DRAFT_MAX_AGE = 2 * 60 * 60 * 1000

function validValues(value: unknown): value is PlanningValues {
  if (!value || typeof value !== 'object') return false
  return ['date', 'startTime', 'durationMinutes', 'minPAs', 'maxPAs'].every((key) => {
    const field = (value as Record<string, unknown>)[key]
    return typeof field === 'string' && field.length <= 32
  })
}
export function PlanningForm({
  context,
  requestKey,
  selectedClassIds,
  restoreDraft,
  rows,
}: {
  context: SchedulingContext
  requestKey: string
  selectedClassIds: string[]
  restoreDraft: boolean
  rows: { cls: WorkshopClass; index: number }[]
}) {
  const defaults = useMemo(
    () =>
      rows.map((r) => ({
        date: '',
        startTime: '',
        durationMinutes: String(r.cls.defaultDurationMinutes),
        minPAs: String(r.cls.defaultMinPAs),
        maxPAs: String(r.cls.defaultMaxPAs),
      })),
    [rows]
  )
  const [values, setValues] = useState<PlanningValues[]>(defaults)
  const [draftReady, setDraftReady] = useState(!restoreDraft)
  const [state, action, pending] = useActionState(createWorkshopBatchForm, {})
  const storageKey = 'workshop-planning-draft:' + requestKey
  const restoredKey = useRef<string | null>(null)
  useEffect(() => {
    if (!restoreDraft) return
    if (restoredKey.current === storageKey) return
    restoredKey.current = storageKey
    try {
      const raw = sessionStorage.getItem(storageKey)
      if (!raw || raw.length > 100_000) return
      const decoded: unknown = JSON.parse(raw)
      if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return
      const saved = decoded as Partial<StoredPlanningDraft>
      const now = Date.now()
      if (
        saved.month !== context.month ||
        typeof saved.createdAt !== 'number' ||
        saved.createdAt > now + 60_000 ||
        now - saved.createdAt > DRAFT_MAX_AGE ||
        !Array.isArray(saved.selectedClassIds) ||
        JSON.stringify(saved.selectedClassIds) !== JSON.stringify(selectedClassIds) ||
        !saved.rows ||
        typeof saved.rows !== 'object' ||
        Array.isArray(saved.rows)
      )
        return
      setValues(
        defaults.map((fallback, index) => {
          const row = rows[index]
          const savedRow = saved.rows?.[row.cls.id + ':' + row.index]
          return validValues(savedRow) ? savedRow : fallback
        })
      )
    } catch {
      try {
        sessionStorage.removeItem(storageKey)
      } catch {
        // Storage can be disabled by browser policy.
      }
    } finally {
      setDraftReady(true)
    }
  }, [context.month, defaults, restoreDraft, rows, selectedClassIds, storageKey])

  const saveDraft = useCallback(
    (current = values) => {
      const stored: StoredPlanningDraft = {
        createdAt: Date.now(),
        month: context.month,
        selectedClassIds,
        rows: Object.fromEntries(
          rows.map((row, index) => [row.cls.id + ':' + row.index, current[index]])
        ),
      }
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(stored))
      } catch {
        // Navigation still works if browser storage is unavailable.
      }
    },
    [context.month, rows, selectedClassIds, storageKey, values]
  )
  useEffect(() => {
    if (draftReady) saveDraft(values)
  }, [draftReady, saveDraft, values])
  return (
    <form action={action} className="space-y-4">
      <ReadyFields disabled={pending || !draftReady}>
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
                    href={classEditPlanningHref(cls.id, context, {
                      planning: '1',
                      planningDraft: requestKey,
                      planningClassIds: selectedClassIds,
                    })}
                    onClick={() => saveDraft()}
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
        {!draftReady && <p role="status">Restoring your planning entries…</p>}
        <SubmitButton>Create planned workshops</SubmitButton>
      </ReadyFields>
    </form>
  )
}
