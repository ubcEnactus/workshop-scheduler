import { z } from 'zod'
import { monthSchema } from '@/lib/schemas/workshops'
import { isCalendarDate, vancouverMonthKey } from '@/lib/time'

const optionalId = z.string().min(1).max(200).optional()
const optionalDate = z.string().refine(isCalendarDate).optional()
export const scheduleViewSchema = z.enum([
  'all',
  'draft',
  'unstaffed',
  'ready',
  'review',
  'published',
])
export const schedulingContextSchema = z.object({
  month: monthSchema,
  schoolId: optionalId,
  classSectionId: optionalId,
  workshopDefinitionId: optionalId,
  batch: optionalId,
  week: optionalDate,
  view: scheduleViewSchema.optional(),
})
export type SchedulingContext = z.infer<typeof schedulingContextSchema>

export function parseSchedulingContext(
  query: Record<string, unknown>,
  fallbackMonth = vancouverMonthKey()
): SchedulingContext {
  const month = monthSchema.safeParse(query.month)
  const school = optionalId.safeParse(query.schoolId || undefined)
  const cls = optionalId.safeParse(query.classSectionId || undefined)
  const view = scheduleViewSchema.safeParse(query.view)
  const workshop = optionalId.safeParse(query.workshopDefinitionId || undefined)
  const batch = optionalId.safeParse(query.batch || undefined)
  const week = optionalDate.safeParse(query.week || undefined)
  return {
    month: month.success
      ? month.data
      : week.success && week.data
        ? week.data.slice(0, 7)
        : fallbackMonth,
    ...(school.success && school.data ? { schoolId: school.data } : {}),
    ...(cls.success && cls.data ? { classSectionId: cls.data } : {}),
    ...(view.success ? { view: view.data } : {}),
    ...(workshop.success && workshop.data ? { workshopDefinitionId: workshop.data } : {}),
    ...(batch.success && batch.data ? { batch: batch.data } : {}),
    ...(week.success && week.data ? { week: week.data } : {}),
  }
}

export function normalizeSchedulingContext(
  query: Record<string, unknown>,
  classes: { id: string; schoolId: string }[],
  schools: { id: string }[]
): { context: SchedulingContext; warning?: string } {
  const context = parseSchedulingContext(query)
  const warnings: string[] = []
  if (query.month && !monthSchema.safeParse(query.month).success)
    warnings.push('Invalid month. Showing the current Vancouver month.')
  if (query.schoolId && !schools.some((s) => s.id === context.schoolId)) {
    delete context.schoolId
    warnings.push('That school is unavailable. The school filter was cleared.')
  }
  if (
    query.classSectionId &&
    !classes.some(
      (c) =>
        c.id === context.classSectionId && (!context.schoolId || c.schoolId === context.schoolId)
    )
  ) {
    delete context.classSectionId
    warnings.push('That teacher is unavailable for this school. The teacher filter was cleared.')
  }
  if (query.view && !scheduleViewSchema.safeParse(query.view).success)
    warnings.push('Unknown schedule view. Showing all workshops.')
  return { context, ...(warnings.length ? { warning: warnings.join(' ') } : {}) }
}

export function schedulingHref(
  path: string,
  context: SchedulingContext,
  extras: Record<string, string | undefined> = {}
) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries({ ...context, ...extras }))
    if (value !== undefined && value !== '') params.set(key, value)
  return path + (params.size ? '?' + params.toString() : '')
}

export function readSchedulingContext(form: FormData, fallbackMonth?: string) {
  return parseSchedulingContext(
    Object.fromEntries(
      ['month', 'schoolId', 'classSectionId', 'view', 'workshopDefinitionId', 'batch', 'week'].map(
        (key) => [
          key,
          form.get(
            key === 'schoolId' && form.has('returnSchoolId')
              ? 'returnSchoolId'
              : key === 'classSectionId' && form.has('returnClassSectionId')
                ? 'returnClassSectionId'
                : key
          ),
        ]
      )
    ),
    fallbackMonth
  )
}
