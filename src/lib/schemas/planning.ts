import { z } from 'zod'
import { isCalendarDate } from '@/lib/time'

const slotSchema = z.object({
  classWorkshopId: z.string().min(1).max(200),
  date: z.string().refine(isCalendarDate, 'Choose a valid candidate date.'),
  startTime: z.string().regex(/^([01]\d|2[0-3]):(?:00|15|30|45)$/, 'Use a 15-minute start time.'),
})
export const batchSchema = z
  .object({
    requestKey: z.uuid(),
    workshopDefinitionId: z.string().min(1).max(200),
    expectedDefinitionRevision: z.coerce.number().int().min(0),
    expectedScheduleHash: z.string().length(64).optional(),
    destination: z.enum(['plan', 'staff']).default('staff'),
    returnWeek: z.string().refine(isCalendarDate).optional(),
    returnClassSectionId: z.string().min(1).max(200).optional(),
    mode: z.literal('IN_PERSON').default('IN_PERSON'),
    location: z.string().trim().max(500).default(''),
    notes: z.string().trim().max(5000).default(''),
    participantInstructions: z.string().trim().max(5000).default(''),
    slots: z.array(slotSchema).min(1, 'Select at least one candidate time.').max(200),
  })
  .refine(
    (data) => new Set(data.slots.map((s) => s.classWorkshopId)).size === data.slots.length,
    'Select only one candidate for each teacher workshop.'
  )
export const planningQuerySchema = z.object({
  workshopDefinitionId: z.string().min(1).max(200).optional(),
  preview: z.boolean(),
})

export type PlanningBatchInput = z.infer<typeof batchSchema>
