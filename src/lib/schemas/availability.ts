import { z } from 'zod'

// Weekly availability form input. The grid posts one checkbox per selected
// slot as name="slots" value="{dayOfWeek}-{startMin}" (e.g. "2-630"), read
// with formData.getAll('slots').
//
// The DB CHECK constraint only enforces day 0–4 / startMin 0–1439 / %30;
// the school-hours window (Mon–Fri 8:30–3:00) is enforced here, app-layer,
// per the comment on the Availability model.

export const SLOT_MINUTES = 30
export const DAY_START_MIN = 510 // 8:30 AM
export const DAY_END_MIN = 900 // 3:00 PM (exclusive) — last slot starts at 870

/** Valid slot start minutes: 510, 540, …, 870 (13 per day). */
export const SLOT_STARTS = Array.from(
  { length: (DAY_END_MIN - DAY_START_MIN) / SLOT_MINUTES },
  (_, i) => DAY_START_MIN + i * SLOT_MINUTES
)

const slotSchema = z
  .string()
  .regex(/^[0-4]-\d{3}$/, 'Invalid slot')
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

export type AvailabilityInput = z.infer<typeof availabilitySchema>
