import { z } from 'zod'
import { isCalendarDate } from '@/lib/time'

// Weekly availability form input. The grid posts one checkbox per selected
// slot as name="slots" value="{dayOfWeek}-{startMin}" (e.g. "2-615"), read
// with formData.getAll('slots').
//
// The DB CHECK constraint only enforces day 0–4 / startMin 0–1439;
// the school-hours window (Mon–Fri 8:30–3:00) is enforced here, app-layer,
// per the comment on the Availability model.

export const SLOT_MINUTES = 15
export const DAY_START_MIN = 510 // 8:30 AM
export const DAY_END_MIN = 900 // 3:00 PM (exclusive) — last slot starts at 870

/** Valid slot start minutes: 510, 525, …, 885 (26 per day). */
export const SLOT_STARTS = Array.from(
  { length: (DAY_END_MIN - DAY_START_MIN) / SLOT_MINUTES },
  (_, i) => DAY_START_MIN + i * SLOT_MINUTES
)

const slotSchema = z
  .string()
  // Shape check only — the real bounds are enforced by the .pipe() below, so
  // this must not hardcode a digit count (a later DAY_END_MIN past 999 would
  // otherwise silently reject valid slots).
  .regex(/^[0-4]-\d+$/, 'Invalid slot')
  .transform((value) => {
    const [day, start] = value.split('-')
    return { dayOfWeek: Number(day), startMin: Number(start) }
  })
  .pipe(
    z.object({
      dayOfWeek: z.number().int().min(0).max(4),
      startMin: z
        .number()
        .int()
        .min(DAY_START_MIN)
        .max(DAY_END_MIN - SLOT_MINUTES)
        .multipleOf(SLOT_MINUTES),
    })
  )

// 5 weekdays; kept local to avoid importing UI-facing labels into a schema.
const WEEKDAY_COUNT = 5

export const availabilitySchema = z.object({
  slots: z.array(slotSchema).max(WEEKDAY_COUNT * SLOT_STARTS.length),
})

export const availabilityChangeSchema = availabilitySchema.extend({
  effectiveFrom: z.string().refine(isCalendarDate, 'Choose a valid effective date.'),
  expectedRevision: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
})

export const currentAvailabilitySchema = availabilityChangeSchema.omit({ effectiveFrom: true })

export const adminAvailabilityTargetSchema = z.object({
  paId: z.string().min(1).max(200),
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
})

const optionalClock = z
  .string()
  .default('')
  .refine((value) => !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(value), 'Enter a valid time.')

function clockMinute(value: string): number | null {
  if (!value) return null
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
}

export const paAvailabilityExceptionSchema = z
  .object({
    date: z.string().refine(isCalendarDate, 'Choose a valid exception date.'),
    kind: z.enum(['AVAILABLE', 'UNAVAILABLE']),
    startTime: optionalClock,
    endTime: optionalClock,
    notes: z.string().trim().max(500).default(''),
  })
  .superRefine((data, ctx) => {
    const start = clockMinute(data.startTime)
    const end = clockMinute(data.endTime)
    if ((start === null) !== (end === null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['endTime'],
        message: 'Set both times or leave both blank.',
      })
      return
    }
    if (data.kind === 'AVAILABLE' && start === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['startTime'],
        message: 'Set the available time range.',
      })
      return
    }
    if (start !== null && end !== null) {
      if (
        start < DAY_START_MIN ||
        end > DAY_END_MIN ||
        start >= end ||
        start % SLOT_MINUTES !== 0 ||
        end % SLOT_MINUTES !== 0
      )
        ctx.addIssue({
          code: 'custom',
          path: ['startTime'],
          message: 'Use a 15-minute range between 8:30 AM and 3:00 PM.',
        })
    }
  })
  .transform((data) => ({
    date: data.date,
    kind: data.kind,
    startMinute: clockMinute(data.startTime),
    endMinute: clockMinute(data.endTime),
    notes: data.notes,
  }))

export const removePAAvailabilityExceptionSchema = z.object({ id: z.string().min(1).max(200) })

export type AvailabilityInput = z.infer<typeof availabilitySchema>
