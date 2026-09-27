import { z } from 'zod'
import { isCalendarDate } from '@/lib/time'
import { DAY_END_MIN, DAY_START_MIN, SLOT_MINUTES } from './availability'

const id = z.string().trim().min(1).max(200)
const date = z.string().refine(isCalendarDate, 'Choose a valid calendar date.')
const optionalDate = z
  .string()
  .default('')
  .refine((value) => !value || isCalendarDate(value), 'Choose a valid calendar date.')
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a valid time.')

function minute(value: string): number {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
}

function validateRange(start: number, end: number, ctx: z.RefinementCtx) {
  if (
    start < DAY_START_MIN ||
    end > DAY_END_MIN ||
    start >= end ||
    start % SLOT_MINUTES !== 0 ||
    end % SLOT_MINUTES !== 0
  )
    ctx.addIssue({
      code: 'custom',
      message: 'Use a 15-minute range between 8:30 AM and 3:00 PM.',
      path: ['startTime'],
    })
}

export const recurringClassAvailabilitySchema = z
  .object({
    classSectionId: id,
    id: z.string().max(200).default(''),
    expectedUpdatedAt: z.string().default(''),
    days: z
      .array(z.coerce.number().int().min(0).max(4))
      .min(1, 'Select at least one weekday.')
      .max(5),
    startTime: clock,
    endTime: clock,
    effectiveFrom: date,
    effectiveUntil: optionalDate,
    notes: z.string().trim().max(500).default(''),
  })
  .superRefine((data, ctx) => {
    if (data.id && data.days.length !== 1)
      ctx.addIssue({
        code: 'custom',
        message: 'Select one weekday for this weekly time.',
        path: ['days'],
      })
    if (data.id && !z.iso.datetime().safeParse(data.expectedUpdatedAt).success)
      ctx.addIssue({
        code: 'custom',
        message: 'This weekly time changed. Reload and try again.',
        path: ['expectedUpdatedAt'],
      })
    validateRange(minute(data.startTime), minute(data.endTime), ctx)
    if (data.effectiveUntil && data.effectiveUntil < data.effectiveFrom)
      ctx.addIssue({
        code: 'custom',
        message: 'The end date must be on or after the start date.',
        path: ['effectiveUntil'],
      })
  })
  .transform((data) => ({
    ...data,
    startMinute: minute(data.startTime),
    endMinute: minute(data.endTime),
    activeForScheduling: true,
  }))

export const removeRecurringClassAvailabilitySchema = z.object({
  classSectionId: id,
  id,
  expectedUpdatedAt: z.iso.datetime(),
})

export const removeClassAvailabilityExceptionSchema = z.object({
  classSectionId: id,
  id,
  expectedUpdatedAt: z.iso.datetime(),
})

export const removeSchoolClosureSchema = z.object({
  schoolId: id,
  id,
  expectedUpdatedAt: z.iso.datetime(),
})

export const classOccurrenceSchema = z.object({
  classSectionId: id,
  id,
  date,
  expectedUpdatedAt: z.iso.datetime(),
  skipId: z.string().max(200).default(''),
})
