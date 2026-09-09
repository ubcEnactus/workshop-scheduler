// Time rendering helpers. Two kinds of values flow through the app:
//
//   1. UTC instants (`DateTime` columns like Workshop.scheduledStart) —
//      rendered in America/Vancouver via Intl.
//   2. Recurring weekly slots (dayOfWeek + minute-of-day ints on
//      ClassMeeting/Availability) — already local wall-clock, so formatting
//      is pure arithmetic. No time zone involved until they're combined
//      with an admin-selected workshop date.

export const VANCOUVER_TZ = 'America/Vancouver'

// Index matches `dayOfWeek` (0=Mon … 4=Fri, no weekends).
export const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const

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

/** "Tue, Feb 3, 2026, 10:00 – 11:00 AM" — shared parts collapsed by Intl. */
export function formatInstantRange(start: Date, end: Date): string {
  return instantFormatter.formatRange(start, end)
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
 * Probe both sides of a transition and round-trip candidates. Reject missing
 * and ambiguous local times instead of silently moving the workshop.
 */
export function vancouverToUtc(dateString: string, minuteOfDay: number): Date {
  if (
    !isCalendarDate(dateString) ||
    !Number.isInteger(minuteOfDay) ||
    minuteOfDay < 0 ||
    minuteOfDay > 1440
  ) {
    throw new Error('Enter a valid Vancouver date and time.')
  }
  if (minuteOfDay === 1440) {
    const tomorrow = new Date(`${dateString}T00:00:00Z`)
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    return vancouverToUtc(tomorrow.toISOString().slice(0, 10), 0)
  }
  const wall = new Date(`${dateString}T00:00:00Z`).getTime() + minuteOfDay * 60_000
  const offsets = new Set<number>()
  for (const hours of [-36, 0, 36]) {
    const zone = offsetFormatter
      .formatToParts(new Date(wall + hours * 3_600_000))
      .find((part) => part.type === 'timeZoneName')?.value
    const match = zone?.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/)
    if (!match) throw new Error('Unable to resolve the Vancouver time zone.')
    offsets.add((match[1] === '+' ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3] ?? 0)))
  }
  const candidates = [...offsets]
    .map((offset) => new Date(wall - offset * 60_000))
    .filter(
      (candidate) =>
        vancouverDateKey(candidate) === dateString &&
        vancouverMinuteOfDay(candidate) === minuteOfDay
    )
  if (candidates.length !== 1)
    throw new Error(
      'This Vancouver time is missing or ambiguous because of a clock change. Choose another time.'
    )
  return candidates[0]
}

export function isCalendarDate(value: string): boolean {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number(value.slice(0, 4)) < 1000 ||
    Number(value.slice(0, 4)) > 9998
  )
    return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function vancouverMonthKey(date = new Date()): string {
  return vancouverDateKey(date).slice(0, 7)
}

export function shiftMonth(month: string, direction: -1 | 1): string {
  if (!isCalendarDate(`${month}-01`)) throw new Error('Invalid month.')
  const date = new Date(`${month}-01T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + direction)
  return date.toISOString().slice(0, 7)
}

export function vancouverMonthBounds(month: string): { start: Date; end: Date } {
  return {
    start: vancouverToUtc(`${month}-01`, 0),
    end: vancouverToUtc(`${shiftMonth(month, 1)}-01`, 0),
  }
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
