import { z } from 'zod'
import { monthSchema } from './workshops'
export const matchingScopeSchema = z.object({
  month: monthSchema,
  classIds: z.array(z.string().min(1).max(100)).min(1, 'Select at least one class.').max(200),
})
export const previewIdSchema = z.object({ id: z.string().min(1).max(100) })
export const matchPlanSchema = z.array(
  z.object({
    workshopId: z.string(),
    paIds: z.array(z.string()),
    protected: z.boolean(),
    reasons: z.array(z.string()),
  })
)
