import { z } from 'zod'
import { schedulingHref, type SchedulingContext } from './navigation'

const planningReturnSchema = z.object({
  planning: z.literal('1'),
  planningDraft: z.uuid(),
  planningClassIds: z
    .array(z.string().min(1).max(200))
    .min(1)
    .max(200)
    .refine((ids) => new Set(ids).size === ids.length),
})

export type PlanningReturn = z.infer<typeof planningReturnSchema>

type PlanningReturnSource = Record<string, unknown> | FormData

function value(source: PlanningReturnSource, key: string) {
  return source instanceof FormData ? source.get(key) : source[key]
}

function values(source: PlanningReturnSource, key: string) {
  if (source instanceof FormData) return source.getAll(key)
  const raw = source[key]
  return Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]
}

export function parsePlanningReturn(source: PlanningReturnSource): PlanningReturn | undefined {
  const parsed = planningReturnSchema.safeParse({
    planning: value(source, 'planning'),
    planningDraft: value(source, 'planningDraft'),
    planningClassIds: values(source, 'planningClassId'),
  })
  return parsed.success ? parsed.data : undefined
}

export function parsePlanningDraft(value: unknown) {
  const parsed = z.uuid().safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function appendPlanningReturn(path: string, state: PlanningReturn) {
  const params = new URLSearchParams({ planning: '1', planningDraft: state.planningDraft })
  for (const id of state.planningClassIds) params.append('planningClassId', id)
  return path + (path.includes('?') ? '&' : '?') + params.toString()
}

export function classEditPlanningHref(
  classId: string,
  context: SchedulingContext,
  state: PlanningReturn
) {
  return appendPlanningReturn(schedulingHref('/admin/classes/' + classId + '/edit', context), state)
}

export function preservePlanningReturn(path: string, source: PlanningReturnSource) {
  const state = parsePlanningReturn(source)
  return state ? appendPlanningReturn(path, state) : path
}

export function planningReturnHref(context: SchedulingContext, source: PlanningReturnSource) {
  const state = parsePlanningReturn(source)
  if (!state) return schedulingHref('/admin/workshops/plan', context)
  const base = schedulingHref('/admin/workshops/plan', context, {
    preview: '1',
    selection: '1',
    planningDraft: state.planningDraft,
  })
  const params = new URLSearchParams()
  for (const id of state.planningClassIds) params.append('classId', id)
  return base + '&' + params.toString()
}
