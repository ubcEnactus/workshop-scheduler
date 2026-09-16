import {
  availabilitySchema,
  DAY_START_MIN,
  DAY_END_MIN,
  SLOT_MINUTES,
} from './schemas/availability'
export function addAvailabilityRange(
  slots: ReadonlySet<string>,
  day: number,
  start: number,
  end: number
): Set<string> {
  if (
    !Number.isInteger(day) ||
    day < 0 ||
    day > 4 ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < DAY_START_MIN ||
    end > DAY_END_MIN ||
    start >= end ||
    start % SLOT_MINUTES ||
    end % SLOT_MINUTES
  )
    throw new Error('Choose a valid 30-minute range between 8:30 AM and 3:00 PM.')
  return new Set([
    ...slots,
    ...Array.from(
      { length: (end - start) / SLOT_MINUTES },
      (_, i) => `${day}-${start + i * SLOT_MINUTES}`
    ),
  ])
}
export function copyAvailabilityDays(
  slots: ReadonlySet<string>,
  source: number,
  days: number[]
): Set<string> {
  const result = new Set(slots)
  if (
    !Number.isInteger(source) ||
    source < 0 ||
    source > 4 ||
    days.some((d) => !Number.isInteger(d) || d < 0 || d > 4)
  )
    throw new Error('Choose weekdays.')
  const parsed = availabilitySchema.parse({ slots: [...slots] })
  for (const d of days)
    for (const slot of parsed.slots.filter((s) => s.dayOfWeek === source))
      result.add(`${d}-${slot.startMin}`)
  return result
}
