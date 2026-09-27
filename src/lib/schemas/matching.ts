import { z } from 'zod'
import { monthSchema } from './workshops'

const idSchema = z.string().min(1).max(100)
const classIdsSchema = z.array(idSchema).min(1, 'Select at least one teacher.').max(200)

export const matchingScopeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('workshop'),
    workshopDefinitionId: idSchema,
  }),
  z.object({
    kind: z.literal('batch'),
    workshopDefinitionId: idSchema,
    batchId: idSchema,
  }),
  z.object({
    kind: z.literal('sessions'),
    workshopDefinitionId: idSchema,
    workshopSessionIds: z
      .array(idSchema)
      .min(1, 'Select at least one dated teacher session.')
      .max(200),
  }),
  z.object({
    kind: z.literal('month'),
    month: monthSchema,
    classIds: classIdsSchema,
  }),
])

export type MatchingScope = z.infer<typeof matchingScopeSchema>

const storedLegacyClassIdsSchema = z.array(idSchema).min(1).max(200)

export function parseStoredMatchingScope(month: string, value: unknown): MatchingScope {
  const current = matchingScopeSchema.safeParse(value)
  if (current.success) return current.data
  return matchingScopeSchema.parse({
    kind: 'month',
    month,
    classIds: storedLegacyClassIdsSchema.parse(value),
  })
}

export const legacyMatchingScopeSchema = z.object({
  kind: z.literal('month').default('month'),
  month: monthSchema,
  classIds: classIdsSchema,
})
export const previewIdSchema = z.object({
  id: idSchema,
  expectedPlanHash: z.string().length(64).optional(),
})
export const previewStaffingSchema = z
  .object({
    id: idSchema,
    workshopSessionId: idSchema,
    operation: z.enum(['inspect', 'add', 'remove']),
    expectedPlanHash: z.string().length(64).optional(),
    paId: idSchema.optional(),
    expectedPolicyHash: z.string().length(64).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.operation !== 'inspect' && (!input.expectedPlanHash || !input.paId))
      ctx.addIssue({ code: 'custom', message: 'Reload the preview before editing.' })
    if (input.operation === 'add' && !input.expectedPolicyHash)
      ctx.addIssue({ code: 'custom', message: 'Review this PA before adding them.' })
  })
export type PreviewStaffingInput = z.input<typeof previewStaffingSchema>
export const matchPlanSchema = z.array(
  z
    .object({
      planVersion: z.literal(2),
      workshopSessionId: z.string(),
      paIds: z.array(z.string()),
      protected: z.boolean(),
      manuallyEdited: z.boolean().optional(),
      overrides: z
        .array(
          z.object({
            paId: idSchema,
            overrideAvailability: z.boolean().default(false),
            overrideSameDay: z.boolean(),
            overrideWeek: z.boolean(),
            overrideReason: z.string().max(500).nullable(),
          })
        )
        .optional(),
      reasons: z.array(z.string()),
      automaticOutcome: z.enum(['COMPLETE', 'PROVEN_SHORTAGE']),
      protectedDeficit: z.boolean(),
      shortageWitness: z
        .object({
          targetSessionIds: z.array(z.string()),
          requiredPlaces: z.number().int().nonnegative(),
          filledPlaces: z.number().int().nonnegative(),
          deficit: z.number().int().nonnegative(),
        })
        .optional(),
      diagnostics: z.object({
        nodes: z.number().int().nonnegative(),
        edges: z.number().int().nonnegative(),
        augmentations: z.number().int().nonnegative(),
      }),
    })
    .strict()
)
export type MatchingPlan = z.infer<typeof matchPlanSchema>
