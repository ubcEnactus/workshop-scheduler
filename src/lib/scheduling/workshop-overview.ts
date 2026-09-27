import { isCalendarDate, vancouverDateKey } from '@/lib/time'

export function showWorkshopOverview(
  query: Record<string, string | undefined>,
  sessions: { status: string; publishedAt: Date | null }[]
) {
  if (query.view === 'overview') return true
  if (
    ['plan', 'staff', 'publish'].includes(query.step ?? '') ||
    [
      'batch',
      'sessionId',
      'classSectionId',
      'addClasses',
      'saved',
      'created',
      'filter',
      'week',
    ].some((key) => query[key] !== undefined)
  )
    return false
  return sessions.some(
    (session) => session.publishedAt !== null || ['PUBLISHED', 'COMPLETED'].includes(session.status)
  )
}

export function workshopCalendarMonth(
  requested: string | undefined,
  sessions: { scheduledStart: Date; status: string }[],
  today: string,
  windowStart: Date | null
) {
  if (requested && isCalendarDate(requested + '-01')) return requested
  const dates = sessions
    .filter((session) => session.status !== 'CANCELLED')
    .map((session) => vancouverDateKey(session.scheduledStart))
    .sort()
  const next = dates.find((date) => date >= today)
  return (next ?? dates.at(-1) ?? windowStart?.toISOString().slice(0, 10) ?? today).slice(0, 7)
}

export type WorkshopOverviewCounts = {
  included: number
  publishedDeficits: number
  windowEnded: number
  staffedDrafts: number
  needPAs: number
  needDates: number
  teacherContactsNeedReview: number
  needAvailability: number
  published: number
}

export type WorkshopNextStepKind =
  | 'ADD_CLASSES'
  | 'PUBLISHED_DEFICIT'
  | 'WINDOW_ENDED'
  | 'REVIEW_DRAFTS'
  | 'ASSIGN_PAS'
  | 'CHOOSE_DATES'
  | 'REVIEW_TEACHERS'
  | 'ADD_AVAILABILITY'
  | 'MANAGE_PUBLISHED'
  | 'ALL_CLEAR'

export function workshopNextStepKind(counts: WorkshopOverviewCounts): WorkshopNextStepKind {
  if (counts.included === 0) return 'ADD_CLASSES'
  if (counts.publishedDeficits > 0) return 'PUBLISHED_DEFICIT'
  if (counts.windowEnded > 0) return 'WINDOW_ENDED'
  if (counts.staffedDrafts > 0) return 'REVIEW_DRAFTS'
  if (counts.needPAs > 0) return 'ASSIGN_PAS'
  if (counts.needDates > 0) return 'CHOOSE_DATES'
  if (counts.teacherContactsNeedReview > 0) return 'REVIEW_TEACHERS'
  if (counts.needAvailability > 0) return 'ADD_AVAILABILITY'
  if (counts.published > 0) return 'MANAGE_PUBLISHED'
  return 'ALL_CLEAR'
}

export function currentWorkshopStep(counts: WorkshopOverviewCounts): 1 | 2 | 3 | 4 | undefined {
  if (counts.included === 0) return 1
  if (counts.publishedDeficits > 0 || counts.staffedDrafts > 0) return 4
  if (counts.needPAs > 0) return 3
  if (counts.needDates > 0 || counts.teacherContactsNeedReview > 0 || counts.needAvailability > 0)
    return 2
  return undefined
}

export function workshopDateProgress(
  datedSessions: number,
  included: number,
  notRequired: number
): string {
  const datesRequired = Math.max(0, included - notRequired)
  return datesRequired === 0 ? 'No dates required' : `${datedSessions} of ${datesRequired} dated`
}
