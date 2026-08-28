'use server'

import { requireRole } from '@/lib/auth'
import { getPAsAvailableAtSlot } from '@/lib/scheduling/heatmap'

export async function getSlotDetailsAction(
  dayOfWeek: number,
  startMin: number,
  schoolCommunity: string | null
) {
  await requireRole('ADMIN')
  return getPAsAvailableAtSlot(dayOfWeek, startMin, schoolCommunity)
}
