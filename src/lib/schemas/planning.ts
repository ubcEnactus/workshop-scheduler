import { z } from 'zod'
import { monthSchema, workshopSchema, clockMinutes } from './workshops'
const slotSchema = z
  .object({
    classSectionId: z.string().min(1),
    date: z.string(),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    durationMinutes: z.coerce.number().int().min(1).max(1440),
    minPAs: z.coerce.number().int().min(1),
    maxPAs: z.coerce.number().int().min(1),
  })
  .transform((data, ctx) => {
    const end = clockMinutes(data.startTime) + data.durationMinutes
    const parsed = workshopSchema.safeParse({
      ...data,
      endTime:
        String(Math.floor(end / 60)).padStart(2, '0') + ':' + String(end % 60).padStart(2, '0'),
    })
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path })
      return z.NEVER
    }
    return parsed.data
  })
export const batchSchema = z
  .object({
    requestKey: z.uuid(),
    month: monthSchema,
    slots: z.array(slotSchema).min(1, 'Select classes with missing workshops.').max(200),
  })
  .refine(
    (data) => data.slots.every((s) => s.date.slice(0, 7) === data.month),
    'All dates must belong to the selected Vancouver month.'
  )
export const planningQuerySchema = z.object({
  month: monthSchema,
  classId: z.array(z.string().min(1)).max(200),
  preview: z.boolean(),
})
