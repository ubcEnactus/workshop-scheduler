'use client'

import Link from 'next/link'
import { useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { formatSlotRange, shiftMonth } from '@/lib/time'
import {
  PACalendarDateEditor,
  type PADatedTime,
  type PADateAction,
} from './pa-calendar-date-editor'

type CalendarDay = {
  date: string
  windows: { startMinute: number; endMinute: number }[]
  sessions: { id: string; title: string; time: string; school: string; completed: boolean }[]
  changes: PADatedTime[]
  weeklyWindows?: { startMinute: number; endMinute: number }[]
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

export function PAAvailabilityCalendar({
  month,
  today,
  days,
  basePath,
  exceptionAction,
  removeExceptionAction,
}: {
  month: string
  today: string
  days: CalendarDay[]
  basePath: string
  exceptionAction?: PADateAction
  removeExceptionAction?: PADateAction
}) {
  const [selected, setSelected] = useState(today.startsWith(month) ? today : `${month}-01`)
  const day = days.find((item) => item.date === selected) ?? days[0]
  const first = new Date(month + '-01T12:00:00Z')
  const offset = (first.getUTCDay() + 6) % 7
  function monthHref(direction: -1 | 1) {
    const query = new URLSearchParams({ month: shiftMonth(month, direction) })
    return basePath + '?' + query
  }
  return (
    <section
      aria-label="Availability calendar"
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
        <h2 className="font-semibold">Calendar</h2>
        <span className="text-xs text-slate-600">Vancouver time</span>
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
                href={monthHref(-1)}
                scroll={false}
                className={buttonClasses({ variant: 'ghost', size: 'sm' })}
              >
                <ChevronLeft className="size-4" />
              </Link>
              <Link
                aria-label="Next month"
                href={monthHref(1)}
                scroll={false}
                className={buttonClasses({ variant: 'ghost', size: 'sm' })}
              >
                <ChevronRight className="size-4" />
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1" role="group" aria-label="Choose a calendar date">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
              <span key={label} className="pb-2 text-center text-xs font-medium text-slate-500">
                {label}
              </span>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <span key={'blank-' + i} />
            ))}
            {days.map((item, i) => (
              <button
                key={item.date}
                type="button"
                aria-pressed={item.date === day.date}
                aria-label={`${dateLabel(item.date)}; ${item.windows.length} available times; ${item.sessions.length} workshops`}
                onClick={() => setSelected(item.date)}
                className={`flex min-h-24 min-w-0 flex-col items-start rounded-lg border p-1 text-left text-xs sm:p-2 ${item.date === day.date ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : (offset + i) % 7 >= 5 ? 'border-transparent bg-slate-50' : 'border-slate-100 hover:border-blue-300'}`}
              >
                <span className="block">{i + 1}</span>
                {item.windows.length > 0 && (
                  <span className="mt-1 block truncate rounded bg-emerald-100 px-1 text-[10px] text-emerald-950">
                    <span className="sm:hidden">{item.windows.length} free</span>
                    <span className="hidden sm:inline">{item.windows.length} available</span>
                  </span>
                )}
                {item.sessions.length > 0 && (
                  <span className="mt-1 inline-flex max-w-full items-center gap-0.5 rounded bg-blue-100 px-1 text-[10px] text-blue-950">
                    {item.sessions.length}
                    <CalendarDays aria-hidden="true" className="size-2.5 sm:hidden" />
                    <span className="hidden sm:inline">booked</span>
                  </span>
                )}
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-600">
            Green: saved availability · Blue: published workshops
          </p>
        </div>
        <aside
          aria-label="Selected date"
          className="space-y-4 border-t border-slate-200 bg-slate-50/60 p-6 xl:border-t-0 xl:border-l"
        >
          <h3 className="text-sm font-semibold">{dateLabel(day.date)}</h3>
          {!day.windows.length && !day.sessions.length && (
            <p className="text-sm text-slate-600">No availability or workshops.</p>
          )}
          {(day.weeklyWindows ?? day.windows).map((window) => (
            <div
              key={window.startMinute}
              className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950"
            >
              <p className="text-xs font-medium">AVAILABLE</p>
              <p className="mt-1 font-semibold">
                {formatSlotRange(window.startMinute, window.endMinute - window.startMinute)}
              </p>
            </div>
          ))}
          {exceptionAction && removeExceptionAction && (
            <PACalendarDateEditor
              key={day.date}
              date={day.date}
              today={today}
              changes={day.changes}
              action={exceptionAction}
              removeAction={removeExceptionAction}
            />
          )}
          {day.sessions.map((session) => (
            <div
              key={session.id}
              className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950"
            >
              <p className="text-xs font-medium">
                {session.completed ? 'COMPLETED WORKSHOP' : 'PUBLISHED WORKSHOP'}
              </p>
              <p className="mt-1 font-semibold">{session.title}</p>
              <p>{session.time}</p>
              <p>{session.school}</p>
            </div>
          ))}
        </aside>
      </div>
    </section>
  )
}
