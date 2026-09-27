'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef, type ReactNode } from 'react'
import { changeClassOccurrence } from '@/app/admin/classes/availability-actions'
import { formatSlotRange } from '@/lib/time'
import type { ResolvedClassAvailabilityWindow } from '@/lib/scheduling/recurring-candidates'
import { SubmitButton } from './submit-button'

export type CalendarWeeklyTime = {
  id: string
  dayOfWeek: number
  startMinute: number
  endMinute: number
  effectiveFrom: string
  effectiveUntil: string | null
  activeForScheduling: boolean
  notes: string | null
  updatedAt: string
  skips: { id: string; date: string }[]
}

export function CalendarAvailabilityCard({
  label,
  windows,
  notes,
  children,
  removed = false,
}: {
  label: string
  windows: Pick<ResolvedClassAvailabilityWindow, 'startMinute' | 'endMinute'>[]
  notes?: string | null
  children?: ReactNode
  removed?: boolean
}) {
  return (
    <div
      className={`space-y-2 rounded-lg border p-3 text-sm ${removed ? 'border-slate-200 bg-slate-50 text-slate-700' : 'border-emerald-200 bg-emerald-50 text-emerald-950'}`}
    >
      <p className="text-xs font-semibold tracking-wide uppercase">{label}</p>
      {windows.map((window) => (
        <p key={`${window.startMinute}:${window.endMinute}`} className="font-semibold">
          {formatSlotRange(window.startMinute, window.endMinute - window.startMinute)}
        </p>
      ))}
      {notes && <p className="break-words">{notes}</p>}
      {children}
    </div>
  )
}

export function CalendarWeeklyOccurrence({
  classId,
  date,
  meeting,
  windows,
  editable,
}: {
  classId: string
  date: string
  meeting: CalendarWeeklyTime
  windows: ResolvedClassAvailabilityWindow[]
  editable: boolean
}) {
  const [state, action] = useActionState(changeClassOccurrence, {})
  const feedback = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (state.saved || state.error) feedback.current?.focus()
  }, [state])
  const skip = meeting.skips.find((item) => item.date === date)
  const weekday = new Intl.DateTimeFormat('en-CA', { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(date + 'T12:00:00Z')
  )
  return (
    <CalendarAvailabilityCard
      label={skip ? 'Removed for this date' : 'Weekly availability'}
      windows={skip ? [meeting] : windows}
      notes={meeting.notes}
      removed={!!skip}
    >
      {editable && (
        <form action={action} className="mt-2 space-y-2">
          <input type="hidden" name="classSectionId" value={classId} />
          <input type="hidden" name="id" value={meeting.id} />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="expectedUpdatedAt" value={meeting.updatedAt} />
          <input type="hidden" name="skipId" value={skip?.id ?? ''} />
          <SubmitButton variant="ghost" size="sm">
            {skip
              ? state.removed && state.skipId === skip.id
                ? 'Undo'
                : 'Restore'
              : 'Remove for this date'}
          </SubmitButton>
          <p className="text-xs text-slate-600">Other {weekday}s stay unchanged.</p>
          <p
            ref={feedback}
            tabIndex={-1}
            role={state.error ? 'alert' : state.saved ? 'status' : undefined}
            className={state.error ? 'text-sm text-red-800' : 'text-sm text-emerald-800'}
          >
            {state.error ??
              (state.saved
                ? state.removed
                  ? 'Availability removed for this date.'
                  : 'Availability restored for this date.'
                : '')}
          </p>
          {state.sessionId && (
            <Link className="text-sm underline" href={`/admin/workshops/${state.sessionId}`}>
              Manage session first
            </Link>
          )}
        </form>
      )}
    </CalendarAvailabilityCard>
  )
}
