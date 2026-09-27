'use client'

import { useActionState } from 'react'
import { Plus } from 'lucide-react'
import { ReadyFields } from './ready-fields'
import { SubmitButton } from './submit-button'
import { Button } from './ui/button'
import { formatSlotRange } from '@/lib/time'

export type PADatedTime = {
  id: string
  kind: 'AVAILABLE' | 'UNAVAILABLE'
  startMinute: number | null
  endMinute: number | null
  notes: string | null
}
export type PADateAction = (
  state: { error?: string; saved?: boolean },
  form: FormData
) => Promise<{ error?: string; saved?: boolean }>

export function PACalendarDateEditor({
  date,
  today,
  changes,
  action,
  removeAction,
}: {
  date: string
  today: string
  changes: PADatedTime[]
  action: PADateAction
  removeAction: PADateAction
}) {
  const [state, formAction, pending] = useActionState(action, {})
  return (
    <>
      {changes.map((item) => (
        <div
          key={item.id}
          className={`space-y-2 rounded-lg border p-3 text-sm ${item.kind === 'AVAILABLE' ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-amber-200 bg-amber-50 text-amber-950'}`}
        >
          <p className="text-xs font-medium">
            {item.kind === 'AVAILABLE' ? 'ADDED FOR THIS DATE' : 'UNAVAILABLE'}
          </p>
          <p className="font-semibold">
            {item.startMinute == null || item.endMinute == null
              ? 'All day'
              : formatSlotRange(item.startMinute, item.endMinute - item.startMinute)}
          </p>
          {item.notes && <p>{item.notes}</p>}
          {date >= today && <RemoveDatedTime id={item.id} action={removeAction} />}
        </div>
      ))}
      {date >= today && (
        <form
          action={formAction}
          className="space-y-3 border-t border-slate-200 pt-4"
          aria-label="Add availability for selected date"
        >
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="kind" value="AVAILABLE" />
          <ReadyFields disabled={pending}>
            <h4 className="flex items-center gap-2 text-sm font-semibold">
              <Plus className="size-4" aria-hidden="true" />
              Add a time
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <label className="field">
                Start time
                <input
                  className="input"
                  type="time"
                  name="startTime"
                  step={900}
                  min="08:30"
                  max="14:45"
                  defaultValue="09:00"
                  required
                />
              </label>
              <label className="field">
                End time
                <input
                  className="input"
                  type="time"
                  name="endTime"
                  step={900}
                  min="08:45"
                  max="15:00"
                  defaultValue="12:00"
                  required
                />
              </label>
            </div>
            <label className="field">
              Notes (optional)
              <input className="input" name="notes" maxLength={500} />
            </label>
            {state.error && (
              <p role="alert" className="text-sm text-red-800">
                {state.error}
              </p>
            )}
            {state.saved && (
              <p role="status" className="text-sm text-emerald-800">
                Availability added.
              </p>
            )}
            <SubmitButton>Add availability</SubmitButton>
          </ReadyFields>
        </form>
      )}
    </>
  )
}
function RemoveDatedTime({ id, action }: { id: string; action: PADateAction }) {
  const [state, formAction, pending] = useActionState(action, {})
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        Remove
      </Button>
      {state.error && (
        <p role="alert" className="text-xs text-red-800">
          {state.error}
        </p>
      )}
    </form>
  )
}
