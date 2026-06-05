import type { Availability, ClassMeeting, Cycle, PA, Workshop } from './types'

// Cycle: Mon 2026-06-08 → Fri 2026-06-12
export const seedCycle: Cycle = {
  id: 'cycle-1',
  name: 'Week 1 – June 2026',
  startDate: '2026-06-08',
  endDate: '2026-06-12',
}

// Three class meeting slots across the week
export const seedClassMeetings: ClassMeeting[] = [
  { id: 'cm-1', cycleId: 'cycle-1', dayOfWeek: 0, startTime: '09:00', endTime: '10:00' }, // Mon
  { id: 'cm-2', cycleId: 'cycle-1', dayOfWeek: 2, startTime: '14:00', endTime: '15:00' }, // Wed
  { id: 'cm-3', cycleId: 'cycle-1', dayOfWeek: 4, startTime: '11:00', endTime: '12:00' }, // Fri
]

export const seedPAs: PA[] = [
  { id: 'pa-1', name: 'Alice' },
  { id: 'pa-2', name: 'Bob' },
  { id: 'pa-3', name: 'Carol' },
  { id: 'pa-4', name: 'Dave' },
]

export const seedAvailabilities: Availability[] = [
  // Alice: Mon 08-11, Wed 13-16
  { id: 'av-1', paId: 'pa-1', dayOfWeek: 0, startTime: '08:00', endTime: '11:00' },
  { id: 'av-2', paId: 'pa-1', dayOfWeek: 2, startTime: '13:00', endTime: '16:00' },
  // Bob: Mon 08-11, Fri 10-13
  { id: 'av-3', paId: 'pa-2', dayOfWeek: 0, startTime: '08:00', endTime: '11:00' },
  { id: 'av-4', paId: 'pa-2', dayOfWeek: 4, startTime: '10:00', endTime: '13:00' },
  // Carol: Wed 13-16, Fri 10-13
  { id: 'av-5', paId: 'pa-3', dayOfWeek: 2, startTime: '13:00', endTime: '16:00' },
  { id: 'av-6', paId: 'pa-3', dayOfWeek: 4, startTime: '10:00', endTime: '13:00' },
  // Dave: only Tue — no workshop falls on Tue, used to test under-supply
  { id: 'av-7', paId: 'pa-4', dayOfWeek: 1, startTime: '09:00', endTime: '10:00' },
]

export const seedWorkshops: Workshop[] = [
  // Mon: Alice + Bob available → satisfies minPAs=1, maxPAs=2
  { id: 'ws-1', title: 'Intro to Python', cycleId: 'cycle-1', classMeetingId: 'cm-1', minPAs: 1, maxPAs: 2, status: 'UNSCHEDULED' },
  // Wed: Alice + Carol available → satisfies minPAs=1, maxPAs=3
  { id: 'ws-2', title: 'Data Structures', cycleId: 'cycle-1', classMeetingId: 'cm-2', minPAs: 1, maxPAs: 3, status: 'UNSCHEDULED' },
  // Fri: Bob + Carol available (2 PAs) but minPAs=3 → UNDER_SUPPLIED
  { id: 'ws-3', title: 'Web Basics', cycleId: 'cycle-1', classMeetingId: 'cm-3', minPAs: 3, maxPAs: 4, status: 'UNSCHEDULED' },
]
