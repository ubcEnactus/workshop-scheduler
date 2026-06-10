import { z } from 'zod'

export const teacherSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  schoolId: z.string().cuid('School is required.'),
})

export const teacherIdSchema = z.object({
  id: z.string().cuid(),
})

export type TeacherInput = z.infer<typeof teacherSchema>
