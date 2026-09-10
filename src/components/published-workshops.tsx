import {
  AlertTriangle,
  CalendarDays,
  Clock3,
  History as HistoryIcon,
  MapPin,
  Users,
} from 'lucide-react'

import { Panel } from '@/components/ui/panel'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatInstantRange, VANCOUVER_TZ } from '@/lib/time'

type Item = {
  id: string
  name: string
  school?: string
  start: Date
  end: Date
  status: string
  pas?: string
  reason?: string
  review?: boolean
}

const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  timeZone: VANCOUVER_TZ,
})
const dayFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  timeZone: VANCOUVER_TZ,
})
const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  timeZone: VANCOUVER_TZ,
})

export function PublishedWorkshops({
  items,
  upcomingTitle,
  empty,
}: {
  items: Item[]
  upcomingTitle: string
  empty: string
}) {
  const now = Date.now()
  const upcoming = items.filter((workshop) => {
    return workshop.status === 'PUBLISHED' && workshop.end.getTime() >= now
  })
  const upcomingIds = new Set(upcoming.map((workshop) => workshop.id))
  const history = items.filter((workshop) => !upcomingIds.has(workshop.id))

  return (
    <>
      {(
        [
          {
            title: upcomingTitle,
            rows: upcoming,
            emptyText: empty,
            icon: CalendarDays,
          },
          {
            title: 'Workshop history',
            rows: history,
            emptyText: 'No workshop history yet.',
            icon: HistoryIcon,
          },
        ] as const
      ).map(({ title, rows, emptyText, icon: EmptyIcon }) => (
        <Panel
          key={title}
          title={title}
          description={
            title === upcomingTitle
              ? 'Published workshop details in Vancouver time.'
              : 'Past and changed workshops remain here for reference.'
          }
        >
          {rows.length === 0 ? (
            <div className="empty-state">
              <EmptyIcon className="size-6 text-slate-400" aria-hidden="true" />
              <p>{emptyText}</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((workshop) => (
                <li key={workshop.id} className="py-5 first:pt-0 last:pb-0">
                  <article className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
                    <time
                      dateTime={workshop.start.toISOString()}
                      className="flex w-full shrink-0 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left sm:w-20 sm:flex-col sm:gap-0 sm:px-2 sm:text-center"
                    >
                      <span className="text-[10px] font-bold tracking-wider text-amber-700 uppercase">
                        {monthFormatter.format(workshop.start)}
                      </span>
                      <span className="text-2xl leading-none font-bold text-[#1e2a4a]">
                        {dayFormatter.format(workshop.start)}
                      </span>
                      <span className="text-xs font-medium text-slate-500">
                        {weekdayFormatter.format(workshop.start)}
                      </span>
                    </time>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-slate-900">{workshop.name}</h3>
                          {workshop.school ? (
                            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                              {workshop.school}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge
                            status={workshop.status}
                            label={`Status: ${workshop.status.toLowerCase()}`}
                          />
                        </div>
                      </div>

                      <p className="mt-3 flex items-start gap-2 text-sm text-slate-600">
                        <Clock3
                          className="mt-0.5 size-4 shrink-0 text-slate-400"
                          aria-hidden="true"
                        />
                        {formatInstantRange(workshop.start, workshop.end)}
                      </p>
                      {workshop.pas !== undefined ? (
                        <p className="mt-2 flex items-start gap-2 text-sm text-slate-600">
                          <Users
                            className="mt-0.5 size-4 shrink-0 text-slate-400"
                            aria-hidden="true"
                          />
                          PAs: {workshop.pas || 'Not assigned'}
                        </p>
                      ) : null}
                      {workshop.reason ? (
                        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                          Latest change: {workshop.reason}
                        </p>
                      ) : null}
                      {workshop.review ? (
                        <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                          This commitment needs admin review. It remains assigned until an admin
                          changes it.
                        </p>
                      ) : null}
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ))}
    </>
  )
}
