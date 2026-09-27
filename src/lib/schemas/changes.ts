import { z } from 'zod'
import { workshopSchema } from './workshops'
const base = z.object({
  id: z.string().min(1).max(100),
  version: z.coerce.number().int().min(0).max(2147483646),
  reason: z.string().trim().min(1, 'Enter a reason for this change.').max(1000),
  inputHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  dateExceptionConfirmed: z
    .preprocess((v) => v === true || v === 'on' || v === 'true', z.boolean())
    .default(false),
})
export const changeRequestSchema = z.discriminatedUnion('kind', [
  base.extend({
    kind: z.literal('REPLACE'),
    oldPaId: z.string().min(1),
    newPaId: z.string().min(1),
  }),
  base.extend({
    kind: z.literal('RESCHEDULE'),
    date: workshopSchema.shape.date,
    startTime: workshopSchema.shape.startTime,
    endTime: workshopSchema.shape.endTime,
  }),
  base.extend({ kind: z.literal('CANCEL') }),
  base.extend({ kind: z.literal('COMPLETE') }),
  base.extend({
    kind: z.literal('EDIT'),
    date: workshopSchema.shape.date,
    startTime: workshopSchema.shape.startTime,
    endTime: workshopSchema.shape.endTime,
    minPAs: workshopSchema.shape.minPAs,
    maxPAs: workshopSchema.shape.maxPAs,
    paIds: z
      .array(z.string().min(1).max(100))
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, 'Select each PA once.'),
    mode: z.literal('IN_PERSON').default('IN_PERSON'),
    location: z.string().trim().max(500).default(''),
    notes: z.string().trim().max(5000).default(''),
    participantInstructions: z.string().trim().max(5000).default(''),
  }),
])
export type ChangeRequest = z.infer<typeof changeRequestSchema>
export const applyChangeSchema = base.pick({
  id: true,
  dateExceptionConfirmed: true,
})
export const auditStateSchema = z.object({
  status: z.enum(['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED']),
  start: z.string().datetime(),
  end: z.string().datetime(),
  pas: z.array(z.object({ id: z.string(), name: z.string() })),
  schemaVersion: z.number().optional(),
  hostTeacherName: z.string().nullable().optional(),
  minPAs: z.number().optional(),
  maxPAs: z.number().optional(),
  mode: z.enum(['IN_PERSON', 'ONLINE']).optional(),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  participantInstructions: z.string().nullable().optional(),
  dateExceptionReason: z.string().nullable().optional(),
  availabilityOverrides: z.array(z.object({ paId: z.string() })).optional(),
  workloadOverrides: z
    .array(
      z.object({
        paId: z.string(),
        sameDay: z.boolean(),
        week: z.boolean(),
        reason: z.string().nullable(),
      })
    )
    .optional(),
})
