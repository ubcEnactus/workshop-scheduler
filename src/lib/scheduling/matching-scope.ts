import type { MatchingScope } from '@/lib/schemas/matching'
import { schedulingHref, type SchedulingContext } from '@/lib/scheduling/navigation'

export function matchingScopeHref(
  path: string,
  scope: MatchingScope,
  context: SchedulingContext,
  extra: Record<string, string> = {}
) {
  const base = schedulingHref(path, context)
  const [pathname, query = ''] = base.split('?')
  const params = new URLSearchParams(query)
  for (const key of [
    'legacy',
    'selection',
    'classId',
    'workshopDefinitionId',
    'batch',
    'sessionId',
  ])
    params.delete(key)
  for (const [key, value] of Object.entries(extra)) params.set(key, value)
  if (scope.kind === 'month') {
    params.set('legacy', '1')
    params.set('month', scope.month)
    params.set('selection', '1')
    for (const id of scope.classIds) params.append('classId', id)
  } else {
    params.delete('schoolId')
    params.delete('classSectionId')
    params.set('workshopDefinitionId', scope.workshopDefinitionId)
    if (scope.kind === 'batch') params.set('batch', scope.batchId)
    if (scope.kind === 'sessions')
      for (const id of scope.workshopSessionIds) params.append('sessionId', id)
  }
  const suffix = params.toString()
  return suffix ? `${pathname}?${suffix}` : pathname
}
