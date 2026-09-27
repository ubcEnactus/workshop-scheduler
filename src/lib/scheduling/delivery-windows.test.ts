import { expect, it } from 'vitest'
import { withinDeliveryWindow } from './delivery-windows'
import { vancouverToUtc } from '@/lib/time'
it('uses Vancouver dates at the inclusive boundaries across daylight saving', () => {
  const window = {
    deliveryStartsOn: new Date('2027-03-12T00:00:00Z'),
    deliveryEndsOn: new Date('2027-03-15T00:00:00Z'),
  }
  for (const day of ['2027-03-12', '2027-03-15'])
    expect(withinDeliveryWindow(window, vancouverToUtc(day, 1080), vancouverToUtc(day, 1320))).toBe(
      true
    )
  for (const day of ['2027-03-11', '2027-03-16'])
    expect(withinDeliveryWindow(window, vancouverToUtc(day, 600), vancouverToUtc(day, 660))).toBe(
      false
    )
  expect(
    withinDeliveryWindow(
      { deliveryStartsOn: null, deliveryEndsOn: null },
      vancouverToUtc('2027-03-16', 600),
      vancouverToUtc('2027-03-16', 660)
    )
  ).toBe(true)
})
