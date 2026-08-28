import { z } from 'zod'

export const workshopIdSchema = z.object({
  id: z.string().min(1),
})

export type WorkshopIdInput = z.infer<typeof workshopIdSchema>

export const assignPASchema = z.object({
  workshopId: z.string().min(1),
  paId: z.string().min(1),
})

export type AssignPAInput = z.infer<typeof assignPASchema>

export const swapPASchema = z.object({
  workshopId: z.string().min(1),
  oldPaId: z.string().min(1),
  newPaId: z.string().min(1),
})

export type SwapPAInput = z.infer<typeof swapPASchema>

export const heatmapQuerySchema = z.object({
  schoolCommunity: z.string().optional(),
  maxCommuteMinutes: z.coerce.number().int().min(0).max(120).optional(),
})

export type HeatmapQueryInput = z.infer<typeof heatmapQuerySchema>

export const slotQuerySchema = z.object({
  dayOfWeek: z.coerce.number().int().min(0).max(4),
  startMin: z.coerce.number().int().min(0),
  endMin: z.coerce.number().int().min(0).optional(),
  schoolCommunity: z.string().optional(),
})

export type SlotQueryInput = z.infer<typeof slotQuerySchema>
