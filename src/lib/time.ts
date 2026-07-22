// dayOfWeek: 0=Mon ... 4=Fri  (matches ClassMeeting and Availability)
// JS Date.getUTCDay(): 0=Sun, 1=Mon ... 5=Fri, 6=Sat
function toUtcDay(dayOfWeek: number): number {
  return dayOfWeek + 1
}

/**
 * Returns all ISO date strings (YYYY-MM-DD) within [startDate, endDate]
 * that fall on the given dayOfWeek (0=Mon...4=Fri).
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

  // Advance to first occurrence of target day
  while (cur.getUTCDay() !== target) {
    cur.setUTCDate(cur.getUTCDate() + 1)
  }

  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 7)
  }

  return dates
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** Returns true if PA availability window fully covers the meeting window. */
export function availabilityCovers(
  meetingStart: number | string,
  meetingEnd: number | string,
  availStart: number | string,
  availEnd: number | string
): boolean {
  const ms = typeof meetingStart === 'string' ? timeToMinutes(meetingStart) : meetingStart
  const me = typeof meetingEnd === 'string' ? timeToMinutes(meetingEnd) : meetingEnd
  const as = typeof availStart === 'string' ? timeToMinutes(availStart) : availStart
  const ae = typeof availEnd === 'string' ? timeToMinutes(availEnd) : availEnd

  return as <= ms && ae >= me
}

/** Returns true if two intervals overlap. */
export function intervalsOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number
): boolean {
  return startA < endB && startB < endA
}

/** Converts a Vancouver wall-clock date and minute to a UTC Date. */
export function vancouverToUtc(dateString: string, minuteOfDay: number): Date {
  const hours = Math.floor(minuteOfDay / 60)
  const minutes = minuteOfDay % 60
  const hh = String(hours).padStart(2, '0')
  const mm = String(minutes).padStart(2, '0')
  const datetimeStr = `${dateString}T${hh}:${mm}:00`

  // Let's create it as UTC first to probe the DST status at that date
  const probe = new Date(`${datetimeStr}Z`)

  // Format the probe date in Vancouver time to extract the offset
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Vancouver',
    timeZoneName: 'shortOffset',
  })
  const parts = formatter.formatToParts(probe)
  const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value // e.g. "GMT-7" or "GMT-8"

  let offsetHours = 0
  if (tzPart && tzPart.startsWith('GMT')) {
    const offsetStr = tzPart.slice(3)
    if (offsetStr) offsetHours = parseInt(offsetStr, 10)
  }

  const utcHours = hours - offsetHours

  return new Date(
    Date.UTC(
      parseInt(dateString.slice(0, 4), 10),
      parseInt(dateString.slice(5, 7), 10) - 1,
      parseInt(dateString.slice(8, 10), 10),
      utcHours,
      minutes,
      0
    )
  )
}
