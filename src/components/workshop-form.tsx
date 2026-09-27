'use client'
import Link from 'next/link'
import { useActionState, useState } from 'react'
import { ReadyFields } from './ready-fields'
import { SubmitButton } from './submit-button'
import type { SchedulingContext } from '@/lib/scheduling/navigation'
import type { WorkshopFormState } from '@/lib/schemas/form-state'

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
  classes: {
    id: string
    name: string
    school: { name: string }
    candidates: { classWorkshopId: string; date: string; startTime: string; endTime: string }[]
  }[]
  month: string
  context?: SchedulingContext
  initial: {
    id: string
    version: number
    workshopDefinitionId: string
    classSectionId: string
    date: string
    startTime: string
    endTime: string
    minPAs: number
    maxPAs: number
    hostingConfirmed?: boolean
    mode?: 'IN_PERSON' | 'ONLINE'
    location?: string | null
    notes?: string | null
    participantInstructions?: string | null
  }
}) {
  const [values, setValues] = useState<Values>({
    ...initial,
    minPAs: String(initial.minPAs),
    maxPAs: String(initial.maxPAs),
  })
  const [state, formAction, pending] = useActionState(action, {})
  const cls = classes.find((c) => c.id === values.classSectionId)
  return (
    <form action={formAction} className="space-y-4">
      <ReadyFields disabled={pending}>
        <input type="hidden" name="id" value={initial.id} />
        <input type="hidden" name="version" value={initial.version} />
        <input type="hidden" name="workshopDefinitionId" value={initial.workshopDefinitionId} />
        <input type="hidden" name="month" value={context?.month ?? month} />
        <input type="hidden" name="schoolId" value={context?.schoolId ?? ''} />
        <input type="hidden" name="returnClassSectionId" value={context?.classSectionId ?? ''} />
        <input type="hidden" name="view" value={context?.view ?? 'all'} />
        <input type="hidden" name="batch" value={context?.batch ?? ''} />
        {state.error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {state.error} Your entries have been kept.
          </p>
        )}
        <label className="field">
          Class
          <select
            className="input"
            name="classSectionId"
            value={values.classSectionId}
            onChange={(e) => setValues({ ...values, classSectionId: e.target.value })}
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.school.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Candidate date and time
          <select
            className="input"
            value=""
            onChange={(e) => {
              const candidate = cls?.candidates[Number(e.target.value)]
              if (e.target.value && candidate) setValues({ ...values, ...candidate })
            }}
          >
            <option value="">Choose a recorded candidate…</option>
            {cls?.candidates.map((slot, index) => (
              <option key={index} value={index}>
                {slot.date} · {slot.startTime}–{slot.endTime}
              </option>
            ))}
          </select>
        </label>
        <Link className="text-sm underline" href={'/admin/classes/' + values.classSectionId}>
          Manage this teacher’s workshop availability
        </Link>
        <div className="form-grid">
          {(
            [
              ['date', 'Vancouver date', 'date'],
              ['startTime', 'Start time', 'time'],
              ['endTime', 'End time', 'time'],
              ['minPAs', 'Minimum PAs', 'number'],
              ['maxPAs', 'Maximum PAs', 'number'],
            ] as const
          ).map(([name, label, type]) => (
            <label key={name} className="field">
              {label}
              <input
                aria-label={label}
                className="input"
                name={name}
                type={type}
                step={type === 'time' ? 900 : undefined}
                min={type === 'number' ? '1' : undefined}
                required
                value={values[name]}
                onChange={(e) => setValues({ ...values, [name]: e.target.value })}
                aria-invalid={!!state.fields?.[name]}
              />
              {state.fields?.[name] && (
                <span className="text-xs text-red-800">{state.fields[name]}</span>
              )}
            </label>
          ))}
        </div>
        <div className="form-grid">
          <input type="hidden" name="mode" value="IN_PERSON" />
          <label className="field">
            Location
            <input
              className="input"
              name="location"
              maxLength={500}
              defaultValue={initial.location ?? ''}
            />
          </label>
          <label className="field">
            Participant instructions
            <textarea
              className="input"
              name="participantInstructions"
              maxLength={5000}
              defaultValue={initial.participantInstructions ?? ''}
            />
          </label>
          <label className="field">
            Internal admin notes
            <textarea
              className="input"
              name="notes"
              maxLength={5000}
              defaultValue={initial.notes ?? ''}
            />
          </label>
        </div>
        <p className="text-xs text-slate-500">
          Vancouver time. The full session must fit a candidate window for this teacher and workshop
          definition. Saving updates the private draft.
        </p>
        <SubmitButton>Save draft</SubmitButton>
      </ReadyFields>
    </form>
  )
}
