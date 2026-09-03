import { z } from 'zod'

export const classSectionSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  subject: z.string().trim().min(1).optional(),
  grade: z.string().trim().min(1).optional(),
  teacherId: z.string().min(1, 'Teacher is required.'),
})

// dayOfWeek: 0=Mon … 4=Fri. startMinute/endMinute: minutes from local midnight.
export const classMeetingSchema = z
  .object({
    classSectionId: z.string().min(1),
    dayOfWeek: z.number().int().min(0).max(4),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
  })
  .refine((d) => d.endMinute > d.startMinute, {
    message: 'End time must be after start time.',
    path: ['endMinute'],
  })

export const classSectionIdSchema = z.object({
  id: z.string().min(1),
})

export const classMeetingIdSchema = z.object({
  id: z.string().min(1),
})

export type ClassSectionInput = z.infer<typeof classSectionSchema>
export type ClassMeetingInput = z.infer<typeof classMeetingSchema>
