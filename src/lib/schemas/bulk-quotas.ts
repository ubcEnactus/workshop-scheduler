import { z } from 'zod'
import { monthSchema } from './workshops'
export type QuotaState = { error?: string; fields?: Record<string, string> }
export const quotaValueSchema = z.union([
  z.literal(''),
  z
    .string()
    .regex(/^\d+$/, 'Enter a whole number, or leave blank.')
    .transform(Number)
    .pipe(z.number().int().min(0).max(2_147_483_647)),
])
export const bulkQuotaSchema = z.object({
  month: monthSchema,
  revision: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(0).max(2_147_483_646)),
  rows: z
    .array(z.object({ paId: z.string().min(1), quota: quotaValueSchema }))
    .max(500)
    .refine(
      (rows) => new Set(rows.map((r) => r.paId)).size === rows.length,
      'Each PA must appear once.'
    ),
})
