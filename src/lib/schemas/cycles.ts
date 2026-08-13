import { z } from 'zod'

export const cycleSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required.'),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((d) => d.endDate > d.startDate, {
    message: 'End date must be after start date.',
    path: ['endDate'],
  })

export const cycleIdSchema = z.object({
  id: z.string().min(1),
})

export type CycleInput = z.infer<typeof cycleSchema>
