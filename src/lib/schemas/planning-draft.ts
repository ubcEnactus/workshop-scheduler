import { z } from 'zod'
import { isCalendarDate } from '@/lib/time'

export const planningChoiceSchema = z.object({
  id: z.string().min(1).max(300),
  date: z.string().refine(isCalendarDate),
  startTime: z.string().regex(/^([01]\d|2[0-3]):(?:00|15|30|45)$/),
  label: z.string().max(300),
})
export type PlanningChoice = z.infer<typeof planningChoiceSchema>
export const planningDraftSchema = z.object({
  selected: z
    .record(z.string().max(200), planningChoiceSchema)
    .refine((v) => Object.keys(v).length <= 200),
  mode: z.enum(['IN_PERSON', 'ONLINE']).transform(() => 'IN_PERSON' as const),
  location: z.string().max(500),
  participantInstructions: z.string().max(5000),
  notes: z.string().max(5000),
})
export type PlanningDraft = z.infer<typeof planningDraftSchema>
export type SavedPlanningChoice = { classWorkshopId: string; date: string; startTime: string }

export function removeSavedPlanningChoices(
  draft: PlanningDraft,
  saved: SavedPlanningChoice[]
): PlanningDraft {
  return {
    ...draft,
    selected: Object.fromEntries(
      Object.entries(draft.selected).filter(
        ([id, choice]) =>
          !saved.some(
            (item) =>
              item.classWorkshopId === id &&
              item.date === choice.date &&
              item.startTime === choice.startTime
          )
      )
    ),
  }
}

export function restorePlanningDraft(
  raw: string | null,
  classWorkshopIds: string[]
): PlanningDraft | undefined {
  if (!raw) return undefined
  try {
    const parsed = planningDraftSchema.safeParse(JSON.parse(raw) as unknown)
    if (!parsed.success) return undefined
    return {
      ...parsed.data,
      selected: Object.fromEntries(
        Object.entries(parsed.data.selected).filter(([id]) => classWorkshopIds.includes(id))
      ),
    }
  } catch {
    return undefined
  }
}
