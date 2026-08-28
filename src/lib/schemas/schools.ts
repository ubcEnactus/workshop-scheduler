import { z } from 'zod'
import { optionalCommunitySchema } from './communities'

export const schoolSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  district: z.string().trim().min(1, 'District is required.'),
  community: optionalCommunitySchema,
})

export const schoolIdSchema = z.object({
  id: z.string().min(1),
})

export type SchoolInput = z.infer<typeof schoolSchema>
