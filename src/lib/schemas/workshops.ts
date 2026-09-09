import { z } from 'zod'
import { isCalendarDate, vancouverToUtc } from '@/lib/time'

export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Choose a month in YYYY-MM format.')
  .refine((value) => isCalendarDate(`${value}-01`), 'Choose a valid month.')
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a valid time.')
const staffingSchema = z.coerce
  .number()
  .int()
  .min(1, 'At least one PA is required.')
  .max(2_147_483_647)

export function clockMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export const workshopSchema = z
  .object({
    classSectionId: z.string().min(1, 'Select a class.'),
    date: z.string().refine(isCalendarDate, 'Enter a valid Vancouver date.'),
    startTime: timeSchema,
    endTime: timeSchema,
    minPAs: staffingSchema,
    maxPAs: staffingSchema,
  })
  .superRefine((data, ctx) => {
    if (data.endTime <= data.startTime)
      ctx.addIssue({
        code: 'custom',
        path: ['endTime'],
        message: 'End time must be after start time on the same date.',
      })
    if (data.maxPAs < data.minPAs)
      ctx.addIssue({
        code: 'custom',
        path: ['maxPAs'],
        message: 'Maximum staffing must be at least the minimum.',
      })
    if (isCalendarDate(data.date)) {
      const day = new Date(`${data.date}T12:00:00Z`).getUTCDay()
      if (day === 0 || day === 6)
        ctx.addIssue({
          code: 'custom',
          path: ['date'],
          message: 'Choose a weekday with a class hosting block.',
        })
      for (const field of ['startTime', 'endTime'] as const) {
        if (timeSchema.safeParse(data[field]).success) {
          try {
            vancouverToUtc(data.date, clockMinutes(data[field]))
          } catch (error) {
            ctx.addIssue({
              code: 'custom',
              path: [field],
              message: error instanceof Error ? error.message : 'Invalid Vancouver time.',
            })
          }
        }
      }
    }
  })

export const workshopIdSchema = z.object({ id: z.string().min(1) })
export const workshopVersionSchema = workshopIdSchema.extend({
  version: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().nonnegative().max(2_147_483_646)),
})
export type WorkshopInput = z.infer<typeof workshopSchema>
