import { z } from 'zod'
import { staffSchema } from './staffing'
import { monthSchema } from './workshops'

export const inlineStaffingSchema = staffSchema.extend({ operation: z.enum(['assign', 'remove']) })
export const bulkPublicationSchema = z.object({
  requestKey: z.string().min(1).max(200).optional(),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  scope: z
    .union([
      z.object({ workshopDefinitionId: z.string().min(1).max(200) }),
      z.object({
        month: monthSchema,
        classSectionIds: z.array(z.string().min(1)).max(200).optional(),
      }),
    ])
    .optional(),
  entries: z
    .array(z.object({ id: z.string().min(1), version: z.number().int().min(0).max(2_147_483_646) }))
    .min(1, 'Select at least one draft.')
    .max(200, 'Publish at most 200 drafts at once.')
    .refine(
      (entries) => new Set(entries.map((entry) => entry.id)).size === entries.length,
      'Select each workshop once.'
    ),
})
