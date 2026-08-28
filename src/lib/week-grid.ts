// Mon–Fri "week at a glance" helpers, shared by the PA and Teacher schedule
// grids (`app/pa/schedule`, `app/teacher/schedule`).
//
// KNOWN LIMITATION — these are server-LOCAL, not Vancouver.
// `getCurrentWeekDates` derives the week from the server clock, and
// `isSameLocalDay` compares calendar parts via the local getters. The two
// schedule pages group workshops into day columns with `isSameLocalDay`, so
// the column labels and the grouping agree with each other, but on a server
// that is not in America/Vancouver both can disagree with the Vancouver dates
// shown elsewhere in the app (which go through `lib/time.ts`).
//
// Making this Vancouver-correct means changing the grouping and the labels
// together; that is a behavioural change, not a refactor, so it is
// intentionally left alone here. See AGENTS.md ("Shared UI").

/** Mon–Fri of the current week, plus a "Week of …" heading. Server-local. */
export function getCurrentWeekDates(): { dates: Date[]; label: string } {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))

  const dates = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })

  const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
  const label = `Week of ${fmt.format(monday)} · This week`
  return { dates, label }
}

const monthDayFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

/** "Feb 3" — server-local, to stay consistent with `getCurrentWeekDates`. */
export function formatMonthDay(d: Date): string {
  return monthDayFormatter.format(d)
}

/** Whether two dates fall on the same server-local calendar day. */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}
