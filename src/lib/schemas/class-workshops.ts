import { z } from 'zod'
import { monthSchema, workshopSchema } from './workshops'
import { isCalendarDate } from '@/lib/time'

const id = z.string().trim().min(1).max(200)
export const identifyClassWorkshopSchema = z.object({
  classWorkshopId: id,
  workshopDefinitionId: id,
  expectedUpdatedAt: z.iso.datetime(),
})
const text = z.string().trim().max(2000).default('')
const optionalPositiveInt = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? undefined : value),
  z.coerce.number().int().min(1).max(10000).optional()
)
const optionalDate = z
  .string()
  .default('')
  .refine((value) => !value || isCalendarDate(value), 'Enter a valid calendar date.')
export const definitionSchema = z
  .object({
    id: z.string().max(200).optional(),
    number: optionalPositiveInt,
    title: z.string().trim().min(1, 'Enter a workshop title.').max(200),
    description: text,
    durationMinutes: z.coerce.number().int().min(1).max(1440),
    defaultMinPAs: z.coerce.number().int().min(1).max(100),
    defaultMaxPAs: z.coerce.number().int().min(1).max(100),
    deliveryStart: optionalDate,
    deliveryEnd: optionalDate,
    expectedUpdatedAt: z.iso.datetime().optional(),
    returnToOverview: z.enum(['1']).optional(),
    confirmWindowImpact: z.enum(['1']).optional(),
    windowExceptionReason: z.string().trim().max(1000).default(''),
  })
  .refine(
    (data) =>
      (!!data.id && !data.deliveryStart && !data.deliveryEnd) ||
      (!!data.deliveryStart && !!data.deliveryEnd && data.deliveryStart <= data.deliveryEnd),
    'New workshops need both delivery dates, with the end on or after the start.'
  )
  .refine((data) => data.defaultMaxPAs >= data.defaultMinPAs, {
    message: 'Maximum staffing must be at least the minimum.',
    path: ['defaultMaxPAs'],
  })

export const duplicateDefinitionSchema = z
  .object({
    sourceId: id,
    title: z.string().trim().min(1, 'Enter a workshop title.').max(200),
    number: optionalPositiveInt,
    deliveryStart: optionalDate,
    deliveryEnd: optionalDate,
  })
  .refine(
    (data) => !!data.deliveryStart && !!data.deliveryEnd && data.deliveryStart <= data.deliveryEnd,
    'Duplicated workshops need both delivery dates, with the end on or after the start.'
  )

export const enrollmentSelectionSchema = z.object({
  runIds: z.array(id).min(1, 'Select at least one workshop.'),
  classSectionIds: z.array(id).min(1, 'Select at least one teacher.'),
  requestKey: z.string().trim().min(8).max(200),
})

export const classWorkshopLifecycleSchema = z.object({
  classWorkshopId: id,
  expectedRevision: z.coerce.number().int().min(0),
  action: z.enum(['REMOVE', 'WAIVE', 'RESTORE']),
  reason: z.string().trim().max(1000).default(''),
})
export const deleteWorkshopDefinitionSchema = z.object({
  workshopDefinitionId: id,
  expectedHash: z.string().regex(/^[a-f0-9]{64}$/, 'Reload this deletion review and try again.'),
  confirm: z.literal('1', { error: 'Confirm permanent workshop deletion.' }),
})
export const classWorkshopSchema = z.object({
  classSectionId: id,
  workshopDefinitionId: id,
  notes: text,
  returnToClass: z.enum(['1']).optional(),
  returnMonth: monthSchema.optional(),
  returnWorkshopDefinitionId: id.optional(),
  returnWeek: z.string().refine(isCalendarDate, 'Enter a valid return week.').optional(),
})
export const availabilitySlotSchema = z
  .object({
    date: workshopSchema.shape.date,
    startTime: workshopSchema.shape.startTime,
    endTime: workshopSchema.shape.endTime,
    classWorkshopId: id,
    id: z.string().max(200).default(''),
    expectedUpdatedAt: z.string().default(''),
    notes: text,
  })
  .superRefine((data, ctx) => {
    const validated = workshopSchema.safeParse({
      ...data,
      classSectionId: 'availability',
      workshopDefinitionId: 'availability',
      minPAs: 1,
      maxPAs: 1,
    })
    if (!validated.success)
      for (const issue of validated.error.issues)
        ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message })
  })
export const removeAvailabilitySchema = z.object({
  classWorkshopId: id,
  id,
  expectedUpdatedAt: z.iso.datetime(),
})
export const classAvailabilitySchema = z
  .object({
    ...availabilitySlotSchema.shape,
    classWorkshopId: z.undefined().optional(),
    classSectionId: id,
  })
  .superRefine((data, ctx) => {
    const parsed = availabilitySlotSchema.safeParse({
      ...data,
      classWorkshopId: 'class-availability',
    })
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message })
  })
export const removeClassAvailabilitySchema = z.object({
  classSectionId: id,
  id,
  expectedUpdatedAt: z.iso.datetime(),
})
export const scheduleCandidateSchema = z.object({
  classWorkshopId: id,
  slotId: id,
  expectedUpdatedAt: z.iso.datetime(),
  startTime: z.string(),
  endTime: z.string(),
  mode: z.literal('IN_PERSON').default('IN_PERSON'),
  location: z.string().trim().max(500).default(''),
  notes: text,
})
