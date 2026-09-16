import { monthSchema } from '@/lib/schemas/workshops'
import { vancouverToUtc } from '@/lib/time'
export type ClassTimes = {
  meetings: { dayOfWeek: number; startMinute: number; endMinute: number }[]
  busy?: { start: string; end: string }[]
}
export function clockLabel(minute: number) {
  return (
    String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0')
  )
}
export function suggestedSlots(cls: ClassTimes, month: string, duration: number) {
  if (
    !monthSchema.safeParse(month).success ||
    !Number.isInteger(duration) ||
    duration < 1 ||
    duration > 1440
  )
    return []
  const result: { date: string; startTime: string; endTime: string }[] = []
  const seen = new Set<string>()
  for (let day = 1; day <= 31; day++) {
    const date = month + '-' + String(day).padStart(2, '0')
    const instant = new Date(date + 'T12:00:00Z')
    if (Number.isNaN(instant.getTime()) || instant.toISOString().slice(0, 10) !== date) continue
    const weekday = instant.getUTCDay() - 1
    for (const block of cls.meetings.filter((b) => b.dayOfWeek === weekday))
      for (let start = block.startMinute; start + duration <= block.endMinute; start += 30) {
        try {
          const from = vancouverToUtc(date, start).getTime(),
            to = vancouverToUtc(date, start + duration).getTime()
          if (cls.busy?.some((b) => from < Date.parse(b.end) && Date.parse(b.start) < to)) continue
          const key = date + ' ' + clockLabel(start)
          if (!seen.has(key)) {
            seen.add(key)
            result.push({
              date,
              startTime: clockLabel(start),
              endTime: clockLabel(start + duration),
            })
          }
        } catch {
          continue
        }
      }
  }
  return result.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
}
