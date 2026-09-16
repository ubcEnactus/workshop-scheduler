import { staffingProblems, type ScheduledWorkshop, type ScheduleSnapshot } from './eligibility'
import type { SchedulingContext } from './navigation'
export function matchesScheduleView(
  workshop: ScheduledWorkshop,
  snapshot: ScheduleSnapshot,
  view: SchedulingContext['view'],
  now = new Date()
) {
  const problems = staffingProblems(snapshot, workshop)
  switch (view) {
    case 'draft':
      return workshop.status === 'DRAFT'
    case 'unstaffed':
      return workshop.status === 'DRAFT' && problems.length > 0
    case 'ready':
      return workshop.status === 'DRAFT' && problems.length === 0
    case 'published':
      return workshop.status === 'PUBLISHED'
    case 'review':
      return workshop.status === 'PUBLISHED' && workshop.scheduledEnd >= now && problems.length > 0
    default:
      return true
  }
}
