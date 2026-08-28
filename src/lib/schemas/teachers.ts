import { z } from 'zod'
import { optionalCommunitySchema } from './communities'

export const teacherSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  schoolId: z.string().min(1, 'School is required.'),
})

// PA-specific schema for creating/updating PAs (includes community + quota)
export const paSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  community: optionalCommunitySchema,
  monthlyQuota: z
    .string()
    .transform((v) => (v === '' ? null : parseInt(v, 10)))
    .pipe(z.number().int().min(1).max(20).nullable()),
})

export const teacherIdSchema = z.object({
  id: z.string().min(1),
})

export type TeacherInput = z.infer<typeof teacherSchema>
export type PAInput = z.infer<typeof paSchema>
