import type { AvailabilitySlot } from '@prisma/client'
import { vancouverDateKey } from '@/lib/time'

export type DeliveryWindow = {
  deliveryStartsOn: Date | null
  deliveryEndsOn: Date | null
}

/** DATE columns represent Vancouver calendar dates; do not timezone-shift them. */
export function dateOnly(value: Date | null): string {
  return value?.toISOString().slice(0, 10) ?? ''
}

export function withinDeliveryWindow(window: DeliveryWindow, start: Date, end: Date): boolean {
  return (
    (!window.deliveryStartsOn || vancouverDateKey(start) >= dateOnly(window.deliveryStartsOn)) &&
    (!window.deliveryEndsOn ||
      vancouverDateKey(new Date(end.getTime() - 1)) <= dateOnly(window.deliveryEndsOn))
  )
}

export function deliveryWindowLabel(window: DeliveryWindow): string {
  if (!window.deliveryStartsOn || !window.deliveryEndsOn) return 'No delivery window set'
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return formatter.formatRange(window.deliveryStartsOn, window.deliveryEndsOn)
}

export function workshopCandidates(record: {
  availabilitySlots: AvailabilitySlot[]
  classSection: { availabilitySlots: AvailabilitySlot[] }
  workshopDefinition: DeliveryWindow
}): AvailabilitySlot[] {
  return [...record.availabilitySlots, ...record.classSection.availabilitySlots]
    .filter((slot) => withinDeliveryWindow(record.workshopDefinition, slot.start, slot.end))
    .sort((a, b) => a.start.getTime() - b.start.getTime())
}
