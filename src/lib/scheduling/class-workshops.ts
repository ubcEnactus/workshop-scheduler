import type { ClassWorkshopStatus, WorkshopStatus } from '@prisma/client'
import { withinDeliveryWindow, type DeliveryWindow } from './delivery-windows'

export type RunCoverageState =
  | 'NEEDS_AVAILABILITY'
  | 'READY_TO_SCHEDULE'
  | 'DRAFT_BOOKED'
  | 'NEEDS_PAS'
  | 'READY_TO_PUBLISH'
  | 'PUBLISHED'
  | 'COMPLETED'
  | 'WAIVED'
  | 'WINDOW_ENDED_OUTSTANDING'

export type CoverageSession = {
  status: WorkshopStatus
  minPAs: number
  assignmentCount: number
}

export function runCoverageState(input: {
  status: ClassWorkshopStatus
  availabilityCount: number
  windowEnded: boolean
  sessions: CoverageSession[]
}): RunCoverageState {
  if (input.status === 'WAIVED') return 'WAIVED'

  const active = input.sessions.find((session) => session.status !== 'CANCELLED')
  if (active?.status === 'COMPLETED') return 'COMPLETED'
  if (active?.status === 'PUBLISHED') return 'PUBLISHED'
  if (active?.status === 'DRAFT') {
    if (active.assignmentCount < active.minPAs) return 'NEEDS_PAS'
    return 'READY_TO_PUBLISH'
  }
  if (input.windowEnded) return 'WINDOW_ENDED_OUTSTANDING'
  if (input.availabilityCount > 0) return 'READY_TO_SCHEDULE'
  return 'NEEDS_AVAILABILITY'
}

export function runCoverageStateLabel(state: RunCoverageState): string {
  return {
    NEEDS_AVAILABILITY: 'Needs availability',
    READY_TO_SCHEDULE: 'Ready to schedule',
    DRAFT_BOOKED: 'Draft session',
    NEEDS_PAS: 'Needs PAs',
    // Coverage knows assignment counts; publication separately checks current eligibility.
    READY_TO_PUBLISH: 'Staffed draft',
    PUBLISHED: 'Published',
    COMPLETED: 'Completed',
    WAIVED: 'Not required',
    WINDOW_ENDED_OUTSTANDING: 'Window ended · delivery outstanding',
  }[state]
}

export function sessionsNeedingDateExceptions<
  T extends {
    scheduledStart: Date
    scheduledEnd: Date
    dateExceptionReason: string | null
    dateExceptionApprovedBy: string | null
  },
>(window: DeliveryWindow, sessions: T[]): T[] {
  return sessions.filter(
    (session) =>
      !withinDeliveryWindow(window, session.scheduledStart, session.scheduledEnd) &&
      !(session.dateExceptionReason && session.dateExceptionApprovedBy)
  )
}

export function classWorkshopStatusLabel(status: ClassWorkshopStatus): string {
  return {
    NEEDS_AVAILABILITY: 'Needs availability',
    READY_TO_SCHEDULE: 'Ready to schedule',
    SCHEDULED: 'Scheduled',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
    WAIVED: 'Not required',
  }[status]
}
