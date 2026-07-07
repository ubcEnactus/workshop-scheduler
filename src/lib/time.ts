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

/** "Tue, Feb 3, 2026, 10:00 – 11:00 AM" — shared parts collapsed by Intl. */
export function formatInstantRange(start: Date, end: Date): string {
  return instantFormatter.formatRange(start, end)
}
