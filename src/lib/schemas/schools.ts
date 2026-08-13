import { z } from 'zod'

export const schoolSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  district: z.string().trim().min(1, 'District is required.'),
})

export const schoolIdSchema = z.object({
  id: z.string().cuid(),
})

export type SchoolInput = z.infer<typeof schoolSchema>
