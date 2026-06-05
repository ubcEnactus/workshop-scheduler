// dayOfWeek: 0=Mon ... 4=Fri  (matches ClassMeeting and Availability)
// JS Date.getUTCDay(): 0=Sun, 1=Mon ... 5=Fri, 6=Sat
function toUtcDay(dayOfWeek: number): number {
  return dayOfWeek + 1
}

/**
 * Returns all ISO date strings (YYYY-MM-DD) within [startDate, endDate]
 * that fall on the given dayOfWeek (0=Mon...4=Fri).
 */
export function getDatesForDayOfWeek(dayOfWeek: number, startDate: string, endDate: string): string[] {
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
  meetingStart: string,
  meetingEnd: string,
  availStart: string,
  availEnd: string
): boolean {
  return (
    timeToMinutes(availStart) <= timeToMinutes(meetingStart) &&
    timeToMinutes(availEnd) >= timeToMinutes(meetingEnd)
  )
}
