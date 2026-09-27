import { z } from 'zod'

export const schoolSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
})

export const schoolIdSchema = z.object({
  id: z.string().min(1),
})

export type SchoolInput = z.infer<typeof schoolSchema>
