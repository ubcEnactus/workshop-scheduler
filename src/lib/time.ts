// Time rendering helpers. Two kinds of values flow through the app:
//
//   1. UTC instants (`DateTime` columns like Workshop.scheduledStart) —
//      rendered in America/Vancouver via Intl.
//   2. Recurring weekly slots (dayOfWeek + minute-of-day ints on
//      ClassMeeting/Availability) — already local wall-clock, so formatting
//      is pure arithmetic. No time zone involved until they're combined
//      with a concrete Cycle date.

export const VANCOUVER_TZ = 'America/Vancouver'

// Index matches `dayOfWeek` (0=Mon … 4=Fri, no weekends).
export const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const

/** Abbreviated form of `DAY_LABELS`, same 0=Mon … 4=Fri indexing. */
export const DAY_LABELS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const

// Intl.DateTimeFormat construction is expensive; build once per module load.
const instantFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: VANCOUVER_TZ,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

function splitMinuteOfDay(min: number): { clock: string; meridiem: 'AM' | 'PM' } {
  const h24 = Math.floor(min / 60) % 24
  const m = min % 60
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return {
    clock: `${h12}:${String(m).padStart(2, '0')}`,
    meridiem: h24 < 12 ? 'AM' : 'PM',
  }
}

/** 510 → "8:30 AM" */
export function formatMinuteOfDay(min: number): string {
  const { clock, meridiem } = splitMinuteOfDay(min)
  return `${clock} ${meridiem}`
}

/**
 * 510 → "8:30–9:00 AM". The meridiem is collapsed only when both endpoints
 * share it: 690 → "11:30 AM–12:00 PM".
 */
export function formatSlotRange(startMin: number, durationMin = 30): string {
  const start = splitMinuteOfDay(startMin)
  const end = splitMinuteOfDay(startMin + durationMin)
  if (start.meridiem === end.meridiem) {
    return `${start.clock}–${end.clock} ${end.meridiem}`
  }
  return `${start.clock} ${start.meridiem}–${end.clock} ${end.meridiem}`
}

/** UTC instant → "Tue, Feb 3, 2026, 10:00 AM" (Vancouver wall clock). */
export function formatInstant(d: Date): string {
  return instantFormatter.format(d)
}

const instantShortFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: VANCOUVER_TZ,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/** UTC instant → "Tue, Feb 3, 10:00 AM" — `formatInstant` without the year. */
export function formatInstantShort(d: Date): string {
  return instantShortFormatter.format(d)
}

const clockFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: VANCOUVER_TZ,
  hour: 'numeric',
  minute: '2-digit',
})

/** UTC instant → "10:00 AM" (Vancouver wall clock). */
export function formatClockTime(d: Date): string {
  return clockFormatter.format(d)
}

/** "Tue, Feb 3, 2026, 10:00 – 11:00 AM" — shared parts collapsed by Intl. */
export function formatInstantRange(start: Date, end: Date): string {
  return instantFormatter.formatRange(start, end)
}

// --- Scheduling helpers ---
// Used by the matching algorithm to turn recurring weekly slots into the
// concrete UTC instants stored on Workshop.scheduledStart/End.

// dayOfWeek: 0=Mon … 4=Fri. JS Date.getUTCDay(): 0=Sun, 1=Mon … 5=Fri.
function toUtcDay(dayOfWeek: number): number {
  return dayOfWeek + 1
}

/**
 * `Cycle.startDate`/`endDate` are UTC-midnight date-only values, so the UTC
 * calendar date is the intended one — don't run these through a Vancouver
 * formatter or they'll shift back a day.
 */
export function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Every ISO date (YYYY-MM-DD) in [startDate, endDate] falling on `dayOfWeek`.
 * Returns [] for a weekend day or a range containing no such weekday.
 */
export function getDatesForDayOfWeek(
  dayOfWeek: number,
  startDate: string,
  endDate: string
): string[] {
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 4) return []
  const target = toUtcDay(dayOfWeek)
  const dates: string[] = []
  const end = new Date(endDate + 'T00:00:00Z')
  const cur = new Date(startDate + 'T00:00:00Z')

  while (cur.getUTCDay() !== target) {
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  while (cur <= end) {
    dates.push(utcDateKey(cur))
    cur.setUTCDate(cur.getUTCDate() + 7)
  }
  return dates
}

/** True when an availability window fully contains a meeting window. */
export function availabilityCovers(
  meetingStart: number,
  meetingEnd: number,
  availStart: number,
  availEnd: number
): boolean {
  return availStart <= meetingStart && availEnd >= meetingEnd
}

/** True when two half-open minute intervals overlap. */
export function intervalsOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number
): boolean {
  return startA < endB && startB < endA
}

const offsetFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: VANCOUVER_TZ,
  timeZoneName: 'shortOffset',
})

/**
 * Vancouver wall clock (ISO date + minute-of-day) → UTC instant.
 *
 * The UTC offset is probed at the same wall-clock time rather than hardcoded,
 * so PST/PDT is handled. The probe reads the offset one side of a DST
 * boundary; that's safe here because slots are school hours and BC's
 * transitions happen at 2 AM.
 */
export function vancouverToUtc(dateString: string, minuteOfDay: number): Date {
  const hours = Math.floor(minuteOfDay / 60)
  const minutes = minuteOfDay % 60
  const hh = String(hours).padStart(2, '0')
  const mm = String(minutes).padStart(2, '0')

  const probe = new Date(`${dateString}T${hh}:${mm}:00Z`)
  const tzPart = offsetFormatter.formatToParts(probe).find((p) => p.type === 'timeZoneName')?.value // "GMT-7" / "GMT-8"

  const offsetHours = tzPart?.startsWith('GMT') ? parseInt(tzPart.slice(3), 10) || 0 : 0

  return new Date(
    Date.UTC(
      parseInt(dateString.slice(0, 4), 10),
      parseInt(dateString.slice(5, 7), 10) - 1,
      parseInt(dateString.slice(8, 10), 10),
      hours - offsetHours,
      minutes,
      0
    )
  )
}

const vancouverDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: VANCOUVER_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** UTC instant → the Vancouver calendar date it falls on ("2026-06-08"). */
export function vancouverDateKey(d: Date): string {
  return vancouverDateFormatter.format(d)
}

const vancouverClockFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: VANCOUVER_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** UTC instant → minutes from Vancouver local midnight. Inverse of `vancouverToUtc`. */
export function vancouverMinuteOfDay(d: Date): number {
  const [h, m] = vancouverClockFormatter.format(d).split(':').map(Number)
  return h * 60 + m
}
