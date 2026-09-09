import { z } from 'zod'
import { workshopSchema } from './workshops'
const base = z.object({
  id: z.string().min(1).max(100),
  version: z.coerce.number().int().min(0).max(2147483646),
  reason: z.string().trim().min(1, 'Enter a reason for this change.').max(1000),
})
export const changeRequestSchema = z.discriminatedUnion('kind', [
  base.extend({
    kind: z.literal('REPLACE'),
    oldPaId: z.string().min(1),
    newPaId: z.string().min(1),
  }),
  base.extend({
    kind: z.literal('RESCHEDULE'),
    date: workshopSchema.shape.date,
    startTime: workshopSchema.shape.startTime,
    endTime: workshopSchema.shape.endTime,
  }),
  base.extend({ kind: z.literal('CANCEL') }),
  base.extend({ kind: z.literal('COMPLETE') }),
])
export type ChangeRequest = z.infer<typeof changeRequestSchema>
export const auditStateSchema = z.object({
  status: z.enum(['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED']),
  start: z.string().datetime(),
  end: z.string().datetime(),
  pas: z.array(z.object({ id: z.string(), name: z.string() })),
})
