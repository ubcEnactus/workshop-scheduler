import { z } from 'zod'
import { monthSchema, workshopVersionSchema } from './workshops'
const integer = z
  .string()
  .regex(/^\d+$/, 'Enter a whole number.')
  .transform(Number)
  .pipe(z.number().int().nonnegative().max(2_147_483_647))
export const quotaSchema = z.object({ paId: z.string().min(1), month: monthSchema, quota: integer })
export const gapSchema = z.object({
  minimumGapMinutes: integer.refine(
    (n) => n > 0 && n <= 10080,
    'Choose a gap of 1 to 10080 minutes.'
  ),
})
export const staffSchema = workshopVersionSchema.extend({ paId: z.string().min(1) })
export const lockSchema = workshopVersionSchema.extend({
  locked: z.enum(['true', 'false']).transform((value) => value === 'true'),
})
