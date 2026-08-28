import { z } from 'zod'

export const blockedDateSchema = z.object({
  schoolId: z.string().optional(),
  date: z.coerce.date(),
  reason: z.string().trim().max(200).optional(),
})

export const blockedDateIdSchema = z.object({
  id: z.string().min(1),
})

export type BlockedDateInput = z.infer<typeof blockedDateSchema>
