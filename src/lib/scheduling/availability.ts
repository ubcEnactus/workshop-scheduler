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

/**
 * Collapse ticked 30-minute slots into contiguous windows.
 *
 * `Availability` stores one row per ticked slot, but the matcher asks whether
 * a single window covers a whole class meeting. Without this, a 60-minute
 * meeting is covered by no 30-minute row and nobody is ever available —
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
