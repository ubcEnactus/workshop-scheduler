import { z } from 'zod'

const id = z.string().min(1).max(200)
const version = z.number().int().min(0).max(2_147_483_646)
export const draftTeamEditSchema = z
  .object({
    workshopDefinitionId: id,
    sessionId: id,
    version,
    requestKey: z.string().min(8).max(200),
    operation: z.enum(['assign', 'remove', 'keep', 'lock', 'unlock', 'allow-pa']),
    paId: id.optional(),
    expectedPolicyHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .superRefine((value, context) => {
    if (['assign', 'remove', 'keep', 'allow-pa'].includes(value.operation) && !value.paId)
      context.addIssue({ code: 'custom', message: 'Select a PA.', path: ['paId'] })
    if (['assign', 'keep'].includes(value.operation) && !value.expectedPolicyHash)
      context.addIssue({
        code: 'custom',
        message: 'Review the current PA information.',
        path: ['expectedPolicyHash'],
      })
  })
export const autoFillDraftSchema = z.object({
  workshopDefinitionId: id,
  requestKey: z.string().min(8).max(200),
  entries: z
    .array(z.object({ id, version }))
    .min(1)
    .max(200)
    .refine(
      (entries) => new Set(entries.map((entry) => entry.id)).size === entries.length,
      'Select each session once.'
    ),
})
export const undoDraftSchema = z.object({
  workshopDefinitionId: id,
  operationId: id,
  requestKey: z.string().min(8).max(200),
})
export type DraftTeamEdit = z.infer<typeof draftTeamEditSchema>
export type AutoFillDraftInput = z.infer<typeof autoFillDraftSchema>
export type UndoDraftInput = z.infer<typeof undoDraftSchema>

const savedAssignmentSchema = z.object({
  id,
  paId: id,
  status: z.enum(['DRAFT', 'PUBLISHED']),
  source: z.enum(['MANUAL', 'AUTOMATIC']),
  overrideAvailability: z.boolean(),
  overrideSameDay: z.boolean(),
  overrideWeek: z.boolean(),
  overrideReason: z.string().nullable(),
  assignedAt: z.string().datetime(),
})
const teamStateSchema = z.object({
  policyHashes: z.record(z.string(), z.string()).optional(),
  version,
  locked: z.boolean(),
  assignments: z.array(savedAssignmentSchema),
  excludedPaIds: z.array(id),
})
export const draftOperationChangesSchema = z.array(
  z.object({
    sessionId: id,
    before: teamStateSchema,
    after: teamStateSchema,
  })
)
export type DraftOperationChanges = z.infer<typeof draftOperationChangesSchema>
