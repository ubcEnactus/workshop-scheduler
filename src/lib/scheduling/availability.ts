import { SLOT_MINUTES } from '@/lib/schemas/availability'

/** A contiguous weekly window when a PA is available. */
export type PAAvailability = {
  paId: string
  dayOfWeek: number
  startMinute: number
  endMinute: number
}

/** The subset of an `Availability` row the scheduler needs. */
export type AvailabilitySlot = {
  userId: string
  dayOfWeek: number
  startMin: number
}

export type EffectiveAvailabilitySlot = AvailabilitySlot & {
  effectiveFrom: Date | string
  effectiveUntil?: Date | string | null
}

export type PAAvailabilityExceptionInput = {
  userId: string
  date: Date | string
  kind: 'AVAILABLE' | 'UNAVAILABLE'
  startMinute?: number | null
  endMinute?: number | null
}

/**
 * Collapse ticked 15-minute slots into contiguous windows.
 *
 * `Availability` stores one row per ticked slot, but the matcher asks whether
 * a single window covers a whole class meeting. Without this, a 60-minute
 * meeting is covered by no 15-minute row and nobody is ever available —
 * the scheduler runs clean and assigns no one.
 *
 * Slots are merged per (user, day) when one ends exactly where the next
 * begins: 13:00 + 13:30 + 14:00 → one 13:00–14:30 window.
 */
export function coalesceAvailability(slots: AvailabilitySlot[]): PAAvailability[] {
  const byUserDay = new Map<string, AvailabilitySlot[]>()
  for (const slot of slots) {
    const key = `${slot.userId}-${slot.dayOfWeek}`
    const group = byUserDay.get(key)
    if (group) group.push(slot)
    else byUserDay.set(key, [slot])
  }

  const windows: PAAvailability[] = []
  for (const group of byUserDay.values()) {
    const sorted = [...group].sort((a, b) => a.startMin - b.startMin)
    let current: PAAvailability | null = null

    for (const slot of sorted) {
      if (current && slot.startMin === current.endMinute) {
        current.endMinute = slot.startMin + SLOT_MINUTES
        continue
      }
      // A duplicate slot (same start) extends nothing; the unique constraint
      // makes it unreachable from the DB, but callers may pass raw input.
      if (current && slot.startMin < current.endMinute) continue

      current = {
        paId: slot.userId,
        dayOfWeek: slot.dayOfWeek,
        startMinute: slot.startMin,
        endMinute: slot.startMin + SLOT_MINUTES,
      }
      windows.push(current)
    }
  }

  return windows
}

function dateOnly(value: Date | string): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10)
}

function dateWeekday(date: string): number {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7
}

function validWindow(startMinute: number | null | undefined, endMinute: number | null | undefined) {
  return (
    startMinute != null &&
    endMinute != null &&
    Number.isInteger(startMinute) &&
    Number.isInteger(endMinute) &&
    startMinute >= 0 &&
    endMinute <= 1440 &&
    startMinute < endMinute
  )
}

/** Full-interval PA coverage after effective dates and one-off exceptions. */
export function paAvailabilityCoversInterval(input: {
  paId: string
  date: string
  startMinute: number
  endMinute: number
  slots: EffectiveAvailabilitySlot[]
  exceptions?: PAAvailabilityExceptionInput[]
}): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !validWindow(input.startMinute, input.endMinute))
    return false
  const recurring = coalesceAvailability(
    input.slots.filter(
      (slot) =>
        slot.userId === input.paId &&
        slot.dayOfWeek === dateWeekday(input.date) &&
        dateOnly(slot.effectiveFrom) <= input.date &&
        (!slot.effectiveUntil || input.date <= dateOnly(slot.effectiveUntil))
    )
  ).map((window) => ({ startMinute: window.startMinute, endMinute: window.endMinute }))
  const exceptions = (input.exceptions ?? []).filter(
    (item) => item.userId === input.paId && dateOnly(item.date) === input.date
  )
  const available = [
    ...recurring,
    ...exceptions
      .filter((item) => item.kind === 'AVAILABLE' && validWindow(item.startMinute, item.endMinute))
      .map((item) => ({ startMinute: item.startMinute!, endMinute: item.endMinute! })),
  ]
    .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute)
    .reduce<{ startMinute: number; endMinute: number }[]>((merged, window) => {
      const current = merged.at(-1)
      if (current && window.startMinute <= current.endMinute) {
        current.endMinute = Math.max(current.endMinute, window.endMinute)
      } else merged.push({ ...window })
      return merged
    }, [])
  const unavailable = exceptions.filter((item) => item.kind === 'UNAVAILABLE')
  if (
    unavailable.some(
      (item) =>
        (item.startMinute == null && item.endMinute == null) ||
        (validWindow(item.startMinute, item.endMinute) &&
          item.startMinute! < input.endMinute &&
          input.startMinute < item.endMinute!)
    )
  )
    return false
  return available.some(
    (window) => window.startMinute <= input.startMinute && window.endMinute >= input.endMinute
  )
}
