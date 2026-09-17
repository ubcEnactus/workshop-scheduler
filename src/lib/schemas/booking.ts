import { z } from 'zod'
import { isCalendarDate, vancouverToUtc } from '@/lib/time'

const NEW_CHOICE = '__new__'
const choiceSchema = z.string().trim().min(1, 'Choose an existing record or create a new one.')
const optionalContextId = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.string().trim().min(1).max(200).optional()
)
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a valid time.')
const staffingSchema = z.coerce
  .number()
  .int()
  .min(1, 'At least one PA is required.')
  .max(2_147_483_647)

function minutes(time: string) {
  const [hours, minute] = time.split(':').map(Number)
  return hours * 60 + minute
}

export const workshopBookingSchema = z
  .object({
    requestKey: z.uuid('Reload the form and try again.'),
    schoolChoice: choiceSchema,
    schoolName: z.string().trim().max(200),
    schoolDistrict: z.string().trim().max(200).default(''),
    teacherChoice: choiceSchema,
    teacherName: z.string().trim().max(200),
    teacherEmail: z
      .string()
      .trim()
      .toLowerCase()
      .refine(
        (value) => value === '' || z.email().safeParse(value).success,
        'Enter a valid email address.'
      ),
    classChoice: choiceSchema,
    className: z.string().trim().max(200),
    date: z.string().refine(isCalendarDate, 'Enter a valid Vancouver date.'),
    startTime: timeSchema,
    endTime: timeSchema,
    minPAs: staffingSchema,
    maxPAs: staffingSchema,
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Choose a month in YYYY-MM format.')
      .optional(),
    schoolId: optionalContextId,
    returnClassSectionId: optionalContextId,
    view: z.preprocess(
      (value) => (value === '' || value === null ? undefined : value),
      z.enum(['all', 'draft', 'unstaffed', 'ready', 'review', 'published']).optional()
    ),
  })
  .superRefine((data, ctx) => {
    if (data.schoolChoice === NEW_CHOICE && data.schoolName === '')
      ctx.addIssue({ code: 'custom', path: ['schoolName'], message: 'School name is required.' })
    if (data.teacherChoice === NEW_CHOICE) {
      if (data.teacherName === '')
        ctx.addIssue({
          code: 'custom',
          path: ['teacherName'],
          message: 'Teacher name is required.',
        })
      if (data.teacherEmail === '')
        ctx.addIssue({
          code: 'custom',
          path: ['teacherEmail'],
          message: 'Teacher email is required.',
        })
    }
    if (data.classChoice === NEW_CHOICE && data.className === '')
      ctx.addIssue({ code: 'custom', path: ['className'], message: 'Class name is required.' })
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
          message: 'Choose a weekday for the workshop.',
        })
      for (const field of ['startTime', 'endTime'] as const) {
        if (!timeSchema.safeParse(data[field]).success) continue
        try {
          vancouverToUtc(data.date, minutes(data[field]))
        } catch (error) {
          ctx.addIssue({
            code: 'custom',
            path: [field],
            message: error instanceof Error ? error.message : 'Invalid Vancouver time.',
          })
        }
      }
    }
  })

export type WorkshopBookingInput = z.infer<typeof workshopBookingSchema>
export { NEW_CHOICE }
