'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import {
  saveClassAvailability,
  removeClassAvailability,
  removeClassAvailabilityException,
  removeRecurringClassAvailability,
  removeSchoolClosure,
  saveRecurringClassAvailability,
} from '@/app/admin/classes/availability-actions'
import {
  CalendarAvailabilityCard,
  CalendarWeeklyOccurrence,
  type CalendarWeeklyTime,
} from './calendar-availability-card'
import { SubmitButton } from './submit-button'
import { buttonClasses } from './ui/button'
import { DAY_LABELS, shiftMonth, formatSlotRange, vancouverToUtc } from '@/lib/time'
import { ReadyFields } from './ready-fields'
import {
  resolveClassAvailabilityWindowsForDate,
  type DatedClassAvailability,
  type RecurringClassAvailability,
} from '@/lib/scheduling/recurring-candidates'
import { schedulingHref, type SchedulingContext } from '@/lib/scheduling/navigation'

export type CalendarAvailability = {
  id: string
  date: string
  startTime: string
  endTime: string
  endDate?: string
  notes: string | null
  updatedAt: string
  workshopId?: string
  workshopTitle?: string
  booked: boolean
}
type CalendarSession = { id: string; date: string; time: string; title: string; status: string }
type CalendarWindow = { id: string; title: string; start: string; end: string }
type RecurringAvailability = CalendarWeeklyTime
type ClassException = {
  id: string
  date: string
  kind: 'CLOSED' | 'ADDITIONAL'
  startMinute: number | null
  endMinute: number | null
  notes: string | null
  updatedAt: string
}
type SchoolClosure = {
  id: string
  date: string
  startMinute: number | null
  endMinute: number | null
  notes: string | null
  updatedAt: string
}

function clock(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

function dateLabel(date: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date + 'T12:00:00Z'))
}
function timeLabel(slot: CalendarAvailability) {
  const duration =
    slot.endDate && slot.endDate !== slot.date
      ? 24 * 60 - timeMinute(slot.startTime) + timeMinute(slot.endTime)
      : timeMinute(slot.endTime) - timeMinute(slot.startTime)
  return formatSlotRange(timeMinute(slot.startTime), duration)
}
function timeMinute(time: string) {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
}
function AvailabilityForm({
  classId,
  date,
  slot,
}: {
  classId: string
  date: string
  slot?: CalendarAvailability
}) {
  const [state, action, pending] = useActionState(saveClassAvailability, {})
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    const form = formRef.current
    const preserveInput = (event: Event) => event.preventDefault()
    form?.addEventListener('reset', preserveInput)
    return () => form?.removeEventListener('reset', preserveInput)
  }, [])
  return (
    <form action={action} ref={formRef} className="space-y-3">
      <input type="hidden" name="classSectionId" value={classId} />
      {slot && (
        <>
          <input type="hidden" name="id" value={slot.id} />
          <input type="hidden" name="expectedUpdatedAt" value={slot.updatedAt} />
        </>
      )}
      <ReadyFields disabled={pending}>
        <label className="field">
          Date
          <input className="input" name="date" type="date" defaultValue={date} required />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="field">
            Start time
            <input
              className="input"
              type="time"
              name="startTime"
              step={900}
              defaultValue={slot?.startTime ?? '09:00'}
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
              defaultValue={slot?.endTime ?? '12:00'}
              required
            />
          </label>
        </div>
        <label className="field">
          Notes (optional)
          <input
            className="input"
            name="notes"
            maxLength={2000}
            defaultValue={slot?.notes ?? ''}
            placeholder="e.g. Teacher confirmed by email"
          />
        </label>
        {state.error && (
          <p role="alert" className="text-sm text-red-800">
            {state.error}
          </p>
        )}
        {state.saved && (
          <p role="status" className="text-sm text-green-800">
            Availability saved.
          </p>
        )}
        <SubmitButton>{slot ? 'Save availability' : 'Add availability'}</SubmitButton>
      </ReadyFields>
    </form>
  )
}
function RemoveAvailability({ classId, slot }: { classId: string; slot: CalendarAvailability }) {
  const [state, action] = useActionState(removeClassAvailability, {})
  return (
    <form action={action}>
      <input type="hidden" name="classSectionId" value={classId} />
      <input type="hidden" name="id" value={slot.id} />
      <input type="hidden" name="expectedUpdatedAt" value={slot.updatedAt} />
      <SubmitButton variant="danger" size="sm">
        Remove availability
      </SubmitButton>
      {state.error && (
        <p role="alert" className="mt-2 text-sm text-red-800">
          {state.error}
        </p>
      )}
    </form>
  )
}

function RecurringForm({
  classId,
  block,
  initialDate,
}: {
  classId: string
  block?: RecurringAvailability
  initialDate: string
}) {
  const [state, action, pending] = useActionState(saveRecurringClassAvailability, {})
  return (
    <form action={action} className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
      <input type="hidden" name="classSectionId" value={classId} />
      {block && (
        <>
          <input type="hidden" name="id" value={block.id} />
          <input type="hidden" name="expectedUpdatedAt" value={block.updatedAt} />
        </>
      )}
      <ReadyFields disabled={pending}>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Days</legend>
          <div className="flex flex-wrap gap-2">
            {DAY_LABELS.map((label, index) => (
              <label key={label} className="cursor-pointer">
                <input
                  className="peer sr-only"
                  type={block ? 'radio' : 'checkbox'}
                  name="days"
                  value={index}
                  defaultChecked={index === (block?.dayOfWeek ?? 0)}
                />
                <span className="inline-flex min-h-10 items-center rounded-lg border border-slate-200 px-3 text-sm peer-checked:border-blue-600 peer-checked:bg-blue-50 peer-checked:font-semibold peer-checked:text-blue-950 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-600">
                  {label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="field">
            From
            <input
              className="input"
              type="time"
              name="startTime"
              step={900}
              defaultValue={block ? clock(block.startMinute) : '09:00'}
              required
            />
          </label>
          <label className="field">
            Until
            <input
              className="input"
              type="time"
              name="endTime"
              step={900}
              defaultValue={block ? clock(block.endMinute) : '12:00'}
              required
            />
          </label>
          <label className="field">
            Starts on
            <input
              className="input"
              type="date"
              name="effectiveFrom"
              defaultValue={block?.effectiveFrom ?? initialDate}
              required
            />
          </label>
          <label className="field">
            Ends on (optional)
            <input
              className="input"
              type="date"
              name="effectiveUntil"
              defaultValue={block?.effectiveUntil ?? ''}
            />
          </label>
        </div>
        <label className="field">
          Note (optional)
          <input className="input" name="notes" maxLength={500} defaultValue={block?.notes ?? ''} />
        </label>
        {state.error && <p className="text-sm text-red-800">{state.error}</p>}
        {state.saved && <p className="text-sm text-emerald-800">Weekly availability saved.</p>}
        <SubmitButton size="sm">Save weekly time</SubmitButton>
      </ReadyFields>
    </form>
  )
}

function RemoveRecurring({ classId, block }: { classId: string; block: RecurringAvailability }) {
  const [state, action] = useActionState(removeRecurringClassAvailability, {})
  return (
    <form action={action}>
      <input type="hidden" name="classSectionId" value={classId} />
      <input type="hidden" name="id" value={block.id} />
      <input type="hidden" name="expectedUpdatedAt" value={block.updatedAt} />
      <SubmitButton variant="ghost" size="sm">
        Remove weekly time
      </SubmitButton>
      {state.error && (
        <p role="alert" className="text-xs text-red-800">
          {state.error}
        </p>
      )}
      {state.sessionId && (
        <Link href={`/admin/workshops/${state.sessionId}`} className="text-sm underline">
          Manage session first
        </Link>
      )}
    </form>
  )
}

function RemoveClassException({
  classId,
  id,
  updatedAt,
  label = 'Remove availability',
}: {
  classId: string
  id: string
  updatedAt: string
  label?: string
}) {
  const [state, action] = useActionState(removeClassAvailabilityException, {})
  return (
    <form action={action}>
      <input type="hidden" name="classSectionId" value={classId} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="expectedUpdatedAt" value={updatedAt} />
      <SubmitButton variant="ghost" size="sm">
        {label}
      </SubmitButton>
      {state.error && (
        <p role="alert" className="text-xs text-red-800">
          {state.error}
        </p>
      )}
      {state.sessionId && (
        <Link href={`/admin/workshops/${state.sessionId}`} className="text-sm underline">
          Manage session first
        </Link>
      )}
    </form>
  )
}

function RemoveSchoolClosure({
  schoolId,
  id,
  updatedAt,
}: {
  schoolId: string
  id: string
  updatedAt: string
}) {
  const [state, action] = useActionState(removeSchoolClosure, {})
  return (
    <form action={action}>
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="expectedUpdatedAt" value={updatedAt} />
      <SubmitButton variant="ghost" size="sm">
        Reopen for all teachers at this school
      </SubmitButton>
      {state.error && (
        <p role="alert" className="text-xs text-red-800">
          {state.error}
        </p>
      )}
      {state.sessionId && (
        <Link href={`/admin/workshops/${state.sessionId}`} className="text-sm underline">
          Manage session first
        </Link>
      )}
    </form>
  )
}

export function ClassCalendar({
  classId,
  schoolId,
  month,
  initialDate,
  availability,
  sessions,
  windows,
  meetings = [],
  availabilityExceptions = [],
  schoolClosures = [],
  navigationContext,
  editable = true,
}: {
  classId: string
  schoolId?: string
  month: string
  initialDate: string
  availability: CalendarAvailability[]
  sessions: CalendarSession[]
  windows: CalendarWindow[]
  meetings?: RecurringAvailability[]
  availabilityExceptions?: ClassException[]
  schoolClosures?: SchoolClosure[]
  navigationContext: SchedulingContext
  editable?: boolean
}) {
  const [selected, setSelected] = useState(initialDate)
  const [windowId, setWindowId] = useState('')
  const window = windows.find((w) => w.id === windowId)
  const first = new Date(month + '-01T12:00:00Z')
  const offset = (first.getUTCDay() + 6) % 7
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  const recurring: RecurringClassAvailability[] = meetings.map((meeting) => ({
    id: meeting.id,
    dayOfWeek: meeting.dayOfWeek,
    startMinute: meeting.startMinute,
    endMinute: meeting.endMinute,
    effectiveFrom: meeting.effectiveFrom,
    effectiveUntil: meeting.effectiveUntil,
    active: meeting.activeForScheduling,
    skippedDates: meeting.skips.map((skip) => skip.date),
  }))
  const datedRules: DatedClassAvailability[] = [
    ...availabilityExceptions,
    ...schoolClosures.map((closure) => ({
      ...closure,
      id: `school:${closure.id}`,
      kind: 'CLOSED' as const,
    })),
  ]
  const availabilityForDate = (date: string) =>
    resolveClassAvailabilityWindowsForDate({ date, recurring, exceptions: datedRules })
  const authorizedExplicitIdsForDate = (date: string) =>
    new Set(
      resolveClassAvailabilityWindowsForDate({
        date,
        recurring: [],
        exceptions: datedRules,
        explicit: availability
          .filter((slot) => slot.date === date)
          .map((slot) => ({
            id: slot.id,
            start: vancouverToUtc(date, timeMinute(slot.startTime)),
            end: vancouverToUtc(slot.endDate ?? date, timeMinute(slot.endTime)),
          })),
      }).flatMap((window) =>
        window.authorization.kind === 'EXPLICIT' ? [window.authorization.id] : []
      )
    )
  const dayWindows = availabilityForDate(selected)
  const dayMeetings = meetings.filter(
    (meeting) =>
      resolveClassAvailabilityWindowsForDate({
        date: selected,
        recurring: [{ ...meeting, active: meeting.activeForScheduling }],
      }).length > 0 &&
      (dayWindows.some(
        (item) => item.authorization.kind === 'RECURRING' && item.authorization.id === meeting.id
      ) ||
        meeting.skips.some((skip) => skip.date === selected))
  )
  const dayAdditions = availabilityExceptions.filter(
    (item) => item.date === selected && item.kind === 'ADDITIONAL'
  )
  const daySlots = availability.filter((slot) => slot.date === selected)
  const dayAuthorizedExplicitIds = authorizedExplicitIdsForDate(selected)
  const dayUnavailable = datedRules.filter(
    (item) => item.date === selected && item.kind === 'CLOSED'
  )
  const daySessions = sessions.filter((s) => s.date === selected)
  const weekday = new Date(selected + 'T12:00:00Z').getUTCDay()
  return (
    <section
      aria-label="Teacher availability calendar"
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold">Teacher availability</h2>
        </div>
        <span className="text-xs font-medium text-slate-500">Vancouver time</span>
      </div>
      <div className="space-y-4 border-b border-slate-200 bg-slate-50/50 p-4 sm:p-6">
        <div>
          <h3 className="font-semibold">Weekly availability</h3>
        </div>
        {meetings.map((block) => (
          <details key={block.id} className="rounded-lg border border-slate-200 bg-white p-3">
            <summary className="cursor-pointer text-sm font-semibold">
              {DAY_LABELS[block.dayOfWeek]} ·{' '}
              {formatSlotRange(block.startMinute, block.endMinute - block.startMinute)}
              {!block.activeForScheduling && (
                <span className="ml-2 text-xs text-amber-900">Needs review</span>
              )}
            </summary>
            {editable && (
              <div className="mt-3 space-y-2">
                <RecurringForm classId={classId} block={block} initialDate={initialDate} />
                <RemoveRecurring classId={classId} block={block} />
              </div>
            )}
          </details>
        ))}
        {!meetings.length && (
          <p className="text-sm text-slate-500">No weekly availability saved.</p>
        )}
        {editable ? (
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-blue-800">
              Add weekly time
            </summary>
            <div className="mt-3">
              <RecurringForm classId={classId} initialDate={initialDate} />
            </div>
          </details>
        ) : (
          <p className="text-sm font-medium text-amber-900">
            Reactivate this teacher before changing availability.
          </p>
        )}
      </div>
      <div className="grid xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 p-3 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="font-semibold">
              {new Intl.DateTimeFormat('en-CA', {
                timeZone: 'UTC',
                month: 'long',
                year: 'numeric',
              }).format(first)}
            </h3>
            <div className="flex gap-1">
              <Link
                aria-label="Previous month"
                href={schedulingHref(`/admin/classes/${classId}`, {
                  ...navigationContext,
                  month: shiftMonth(month, -1),
                })}
                className={buttonClasses({ variant: 'ghost', size: 'sm' })}
              >
                <ChevronLeft className="size-4" />
              </Link>
              <Link
                aria-label="Next month"
                href={schedulingHref(`/admin/classes/${classId}`, {
                  ...navigationContext,
                  month: shiftMonth(month, 1),
                })}
                className={buttonClasses({ variant: 'ghost', size: 'sm' })}
              >
                <ChevronRight className="size-4" />
              </Link>
            </div>
          </div>
          <label className="field mb-4">
            Show delivery window
            <select
              className="input"
              value={windowId}
              onChange={(e) => setWindowId(e.target.value)}
            >
              <option value="">All dates</option>
              {windows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title}
                </option>
              ))}
            </select>
          </label>
          {window && (
            <p className="mb-3 text-sm text-amber-900">
              {window.start && window.end
                ? `${window.start} through ${window.end} · highlighted in amber`
                : 'This workshop has no delivery window yet.'}
            </p>
          )}
          <div
            className="grid grid-cols-7 gap-1"
            role="group"
            aria-label="Choose an availability date"
          >
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <span key={d} className="pb-2 text-center text-xs font-medium text-slate-500">
                {d}
              </span>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <span key={'blank-' + i} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const date = `${month}-${String(i + 1).padStart(2, '0')}`
              const slots = availability.filter((s) => s.date === date)
              const effectiveWindows = availabilityForDate(date)
              const authorizedExplicitIds = authorizedExplicitIdsForDate(date)
              const availabilityCount =
                new Set(
                  effectiveWindows.map(
                    (item) => `${item.authorization.kind}:${item.authorization.id}`
                  )
                ).size + slots.filter((slot) => authorizedExplicitIds.has(slot.id)).length
              const booked = sessions.filter((s) => s.date === date)
              const weekend = (offset + i) % 7 >= 5
              const highlighted =
                window?.start && window?.end && date >= window.start && date <= window.end
              return (
                <button
                  key={date}
                  type="button"
                  aria-pressed={date === selected}
                  aria-label={`${dateLabel(date)}; ${availabilityCount} available ${availabilityCount === 1 ? 'time' : 'times'}; ${booked.length} sessions`}
                  onClick={() => setSelected(date)}
                  className={`flex min-h-20 min-w-0 flex-col items-center gap-1 rounded-lg border p-1 text-sm transition-colors sm:min-h-24 sm:items-start sm:p-2 ${date === selected ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : highlighted ? 'border-amber-200 bg-amber-50' : weekend ? 'border-transparent bg-slate-50 text-slate-600' : 'border-slate-100 hover:border-slate-300'}`}
                >
                  <span className="font-medium">{i + 1}</span>
                  {availabilityCount > 0 && (
                    <span className="max-w-full rounded bg-emerald-100 px-1 text-[10px] font-medium text-emerald-900">
                      <span className="sm:hidden">{availabilityCount} avail</span>
                      <span className="hidden sm:inline">{availabilityCount} available</span>
                    </span>
                  )}
                  {booked.length > 0 && (
                    <span className="max-w-full rounded bg-blue-100 px-1 text-[10px] font-medium text-blue-900">
                      {booked.length} booked
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Green: available times · Blue: booked teacher sessions.
          </p>
        </div>
        <div
          className="min-w-0 space-y-5 border-t border-slate-200 bg-slate-50/70 p-4 sm:p-6 xl:border-t-0 xl:border-l"
          aria-label="Selected date"
        >
          <h3 className="font-semibold">{dateLabel(selected)}</h3>
          {daySessions.map((s) => (
            <Link
              key={s.id}
              href={'/admin/workshops/' + s.id}
              className="block rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950"
            >
              <span className="block font-semibold">{s.title}</span>
              {s.time} · {s.status.toLowerCase()}
            </Link>
          ))}
          {dayMeetings.map((meeting) => (
            <CalendarWeeklyOccurrence
              key={selected + meeting.id}
              classId={classId}
              date={selected}
              meeting={meeting}
              editable={editable}
              windows={dayWindows.filter(
                (item) =>
                  item.authorization.kind === 'RECURRING' && item.authorization.id === meeting.id
              )}
            />
          ))}
          {dayAdditions.map((item) => {
            const ranges = dayWindows.filter(
              (window) =>
                window.authorization.kind === 'ADDITIONAL' && window.authorization.id === item.id
            )
            return (
              <CalendarAvailabilityCard
                key={item.id}
                label="Extra availability"
                windows={ranges}
                notes={item.notes}
              >
                {!ranges.length && (
                  <p className="text-xs text-amber-900">
                    This saved time is blocked by an unavailable exception or closure.
                  </p>
                )}
                {editable && (
                  <RemoveClassException classId={classId} id={item.id} updatedAt={item.updatedAt} />
                )}
              </CalendarAvailabilityCard>
            )
          })}
          {dayUnavailable.map((item) => {
            const schoolClosure = item.id.startsWith('school:')
            const details = schoolClosure
              ? schoolClosures.find((closure) => `school:${closure.id}` === item.id)
              : availabilityExceptions.find((exception) => exception.id === item.id)
            return (
              <div
                key={item.id}
                className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
              >
                <p className="font-semibold">Unavailable</p>
                <p>
                  {item.startMinute == null || item.endMinute == null
                    ? 'All day'
                    : formatSlotRange(item.startMinute, item.endMinute - item.startMinute)}
                  {' · '}
                  {schoolClosure ? 'School closure' : 'Teacher exception'}
                </p>
                {details?.notes && <p className="mt-1 break-words">{details.notes}</p>}
                {editable &&
                  details &&
                  (schoolClosure && schoolId ? (
                    <RemoveSchoolClosure
                      schoolId={schoolId}
                      id={details.id}
                      updatedAt={details.updatedAt}
                    />
                  ) : !schoolClosure ? (
                    <RemoveClassException
                      classId={classId}
                      id={details.id}
                      updatedAt={details.updatedAt}
                      label="Reopen this time"
                    />
                  ) : null)}
              </div>
            )
          })}
          {daySlots.map((slot) => (
            <div
              key={slot.id}
              className="space-y-2 rounded-lg border border-emerald-200 bg-white p-3"
            >
              <p className="text-xs font-semibold tracking-wide text-emerald-900 uppercase">
                Dated availability
              </p>
              <p className="text-sm font-semibold text-emerald-900">{timeLabel(slot)}</p>
              <p className="text-xs text-slate-600">
                {slot.workshopId
                  ? `For ${slot.workshopTitle} only`
                  : 'Available for any workshop in its delivery window'}
              </p>
              {!dayAuthorizedExplicitIds.has(slot.id) && (
                <p className="text-xs font-semibold text-amber-900">
                  This saved time is currently blocked by an unavailable exception or closure.
                </p>
              )}
              {slot.notes && <p className="text-sm break-words text-slate-600">{slot.notes}</p>}
              {slot.workshopId ? (
                <Link
                  href={'/admin/class-workshops/' + slot.workshopId}
                  className="text-xs underline"
                >
                  Manage recorded candidate
                </Link>
              ) : slot.booked || !editable ? (
                <p className="text-xs text-slate-500">
                  {slot.booked
                    ? 'Supports a booked session. Manage date changes from the session.'
                    : 'Reactivate this teacher before changing availability.'}
                </p>
              ) : (
                <>
                  <details>
                    <summary className="cursor-pointer text-sm">Edit availability</summary>
                    <div className="mt-3">
                      <AvailabilityForm
                        key={slot.updatedAt}
                        classId={classId}
                        date={slot.date}
                        slot={slot}
                      />
                    </div>
                  </details>
                  {editable && <RemoveAvailability classId={classId} slot={slot} />}
                </>
              )}
            </div>
          ))}
          {!dayMeetings.length &&
            !dayAdditions.length &&
            !dayWindows.length &&
            !dayUnavailable.length &&
            !daySlots.length &&
            !daySessions.length && (
              <p className="text-sm text-slate-500">No availability or sessions recorded.</p>
            )}
          {editable && weekday !== 0 && weekday !== 6 ? (
            <div className="space-y-3 border-t border-slate-200 pt-4">
              <h4 className="flex items-center gap-2 text-sm font-semibold">
                <Plus className="size-4" />
                Add a time
              </h4>
              <AvailabilityForm key={selected} classId={classId} date={selected} />
            </div>
          ) : (
            <p className="text-sm text-slate-600">Select a weekday to add availability.</p>
          )}
        </div>
      </div>
    </section>
  )
}
