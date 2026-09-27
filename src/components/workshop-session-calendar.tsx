'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { shiftMonth } from '@/lib/time'
import { buttonClasses } from './ui/button'
import { StatusBadge } from './ui/status-badge'

export type OverviewSession = {
  id: string
  date: string
  time: string
  school: string
  teacher: string
  team: string[]
  status: 'DRAFT' | 'PUBLISHED' | 'COMPLETED' | 'CANCELLED'
  location: string | null
  problems: string[]
  minPAs: number
}
function label(date: string, monthOnly = false) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    ...(monthOnly ? {} : ({ day: 'numeric', weekday: 'long' } as const)),
  }).format(new Date(date + 'T12:00:00Z'))
}

export function WorkshopSessionCalendar({
  sessions,
  month,
  today,
  basePath,
}: {
  sessions: OverviewSession[]
  month: string
  today: string
  basePath: string
}) {
  const [filter, setFilter] = useState('active')
  const [selected, setSelected] = useState(
    sessions.find((s) => s.date >= today && s.status !== 'CANCELLED')?.date ??
      sessions.find((s) => s.status !== 'CANCELLED')?.date ??
      `${month}-01`
  )
  const visible = sessions.filter((s) =>
    filter === 'active' ? s.status !== 'CANCELLED' : s.status === filter
  )
  const first = new Date(`${month}-01T12:00:00Z`)
  const offset = (first.getUTCDay() + 6) % 7
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  return (
    <section
      aria-label="Workshop session calendar"
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <h2 className="font-semibold">Session calendar</h2>
        <label className="flex items-center gap-2 text-sm">
          Status
          <select
            aria-label="Session status"
            className="input"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="active">All active sessions</option>
            <option value="PUBLISHED">Published</option>
            <option value="DRAFT">Drafts</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </label>
      </div>
      <div className="grid xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 p-3 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="font-semibold">{label(`${month}-01`, true)}</h3>
            <div className="flex gap-1">
              {([-1, 1] as const).map((direction) => (
                <Link
                  key={direction}
                  href={`${basePath}?view=overview&month=${shiftMonth(month, direction)}`}
                  scroll={false}
                  aria-label={direction === -1 ? 'Previous month' : 'Next month'}
                  className={buttonClasses({ variant: 'ghost', size: 'sm' })}
                >
                  {direction === -1 ? (
                    <ChevronLeft className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                </Link>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1" role="group" aria-label="Choose a session date">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <span key={day} className="pb-2 text-center text-xs text-slate-600">
                {day}
              </span>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {Array.from({ length: count }, (_, i) => {
              const date = `${month}-${String(i + 1).padStart(2, '0')}`
              const items = visible.filter((s) => s.date === date)
              return (
                <button
                  key={date}
                  type="button"
                  aria-pressed={selected === date}
                  aria-label={`${label(date)}; ${items.length} sessions`}
                  onClick={() => setSelected(date)}
                  className={`flex min-h-24 min-w-0 flex-col gap-1 rounded-lg border p-1 text-left text-xs sm:min-h-28 sm:p-2 ${selected === date ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-slate-100 hover:border-blue-300'}`}
                >
                  <span className={date === today ? 'font-bold text-blue-800' : ''}>{i + 1}</span>
                  {items.length > 0 && (
                    <span className="rounded bg-blue-100 px-1 text-[10px] text-blue-950 sm:hidden">
                      {items.length}
                      <span className="sr-only"> sessions</span>
                    </span>
                  )}
                  {items.slice(0, 2).map((item) => (
                    <span
                      key={item.id}
                      className={`hidden w-full truncate rounded px-1 py-0.5 text-[10px] sm:block ${item.status === 'PUBLISHED' ? 'bg-blue-100 text-blue-950' : item.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-950' : 'bg-slate-100 text-slate-700'}`}
                    >
                      {item.time.split('–')[0]} · {item.school}
                    </span>
                  ))}
                  {items.length > 2 && (
                    <span className="hidden text-[10px] text-slate-600 sm:block">
                      +{items.length - 2} more
                    </span>
                  )}
                  {items.some((item) => item.problems.length) && (
                    <AlertTriangle aria-label="Needs attention" className="size-3 text-red-800" />
                  )}
                </button>
              )
            })}
          </div>
          {!visible.length && (
            <p className="mt-4 text-sm text-slate-600">
              No {filter === 'active' ? '' : filter.toLowerCase() + ' '}sessions this month.
            </p>
          )}
          <p className="mt-4 text-xs text-slate-600">Vancouver time</p>
        </div>
        <aside
          aria-label="Selected session date"
          className="space-y-4 border-t border-slate-200 bg-slate-50/60 p-5 xl:border-t-0 xl:border-l"
        >
          <h3 className="text-sm font-semibold">{label(selected)}</h3>
          {!visible.some((s) => s.date === selected) && (
            <p className="text-sm text-slate-600">No sessions on this date.</p>
          )}
          {visible
            .filter((s) => s.date === selected)
            .map((session) => (
              <article
                key={session.id}
                className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
              >
                <StatusBadge status={session.status} />
                <div>
                  <h4 className="font-semibold">{session.school}</h4>
                  <p className="text-sm">{session.teacher}</p>
                  <p className="mt-1 text-sm font-medium">{session.time}</p>
                </div>
                {session.location && <p className="text-sm text-slate-600">{session.location}</p>}
                <div className="text-sm">
                  <p className="font-medium">PA team</p>
                  <p className="text-slate-600">{session.team.join(', ') || 'No PAs assigned'}</p>
                </div>
                {session.problems.length > 0 && (
                  <div className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
                    <p className="flex items-center gap-2 font-semibold">
                      <AlertTriangle className="size-4" aria-hidden="true" />
                      {session.team.length < session.minPAs
                        ? `Needs ${session.minPAs - session.team.length} PA${session.minPAs - session.team.length === 1 ? '' : 's'}`
                        : 'Needs attention'}
                    </p>
                    <ul className="mt-1 list-inside list-disc">
                      {session.problems.map((problem) => (
                        <li key={problem}>{problem}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <Link
                  className={buttonClasses({ size: 'sm' })}
                  href={`/admin/workshops/${session.id}?from=workshop&month=${month}`}
                >
                  {session.status === 'COMPLETED' || session.status === 'CANCELLED'
                    ? 'View session'
                    : 'View & edit session'}
                </Link>
              </article>
            ))}
        </aside>
      </div>
    </section>
  )
}
