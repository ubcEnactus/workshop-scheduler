export type WorkshopStatus = 'UNSCHEDULED' | 'PROPOSED' | 'CONFIRMED' | 'UNDER_SUPPLIED'
export type AssignmentStatus = 'PROPOSED' | 'CONFIRMED'

export interface Cycle {
  id: string
  name: string
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
}

export interface ClassMeeting {
  id: string
  cycleId: string
  dayOfWeek: number // 0=Mon ... 4=Fri
  startTime: string // "HH:MM"
  endTime: string // "HH:MM"
  location?: string
}

export interface PA {
  id: string
  name: string
}

export interface Availability {
  id: string
  paId: string
  dayOfWeek: number // 0=Mon ... 4=Fri
  startTime: string // "HH:MM"
  endTime: string // "HH:MM"
}

export interface Workshop {
  id: string
  title: string
  cycleId: string
  classMeetingId: string
  minPAs: number
  maxPAs: number
  status: WorkshopStatus
  scheduledStart?: string // ISO datetime
  scheduledEnd?: string // ISO datetime
}

export interface Assignment {
  id: string
  workshopId: string
  paId: string
  status: AssignmentStatus
}
