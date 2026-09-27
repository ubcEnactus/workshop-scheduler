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
