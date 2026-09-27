import {
  paAvailabilityCoversInterval,
  type EffectiveAvailabilitySlot,
  type PAAvailabilityExceptionInput,
} from '@/lib/scheduling/availability'
import { SLOT_MINUTES } from '@/lib/schemas/availability'

/** Use the matcher's exact coverage rules, including legacy times and admin exceptions. */
export function paCalendarWindows(
  paId: string,
  date: string,
  slots: EffectiveAvailabilitySlot[],
  exceptions: PAAvailabilityExceptionInput[]
) {
  const boundaries = [
    ...new Set([
      0,
      1440,
      ...slots
        .filter((slot) => slot.userId === paId)
        .flatMap((slot) => [slot.startMin, slot.startMin + SLOT_MINUTES]),
      ...exceptions
        .filter(
          (item) =>
            item.userId === paId &&
            (typeof item.date === 'string'
              ? item.date.slice(0, 10)
              : item.date.toISOString().slice(0, 10)) === date
        )
        .flatMap((item) => [item.startMinute ?? 0, item.endMinute ?? 1440]),
    ]),
  ].sort((a, b) => a - b)
  const windows: { startMinute: number; endMinute: number }[] = []
  for (let i = 0; i < boundaries.length - 1; i++) {
    const startMinute = boundaries[i],
      endMinute = boundaries[i + 1]
    if (!paAvailabilityCoversInterval({ paId, date, startMinute, endMinute, slots, exceptions }))
      continue
    const last = windows.at(-1)
    if (last?.endMinute === startMinute) last.endMinute = endMinute
    else windows.push({ startMinute, endMinute })
  }
  return windows
}
