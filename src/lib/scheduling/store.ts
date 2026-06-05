import {
  seedAvailabilities,
  seedClassMeetings,
  seedCycle,
  seedPAs,
  seedWorkshops,
} from '../seed'
import type { Assignment, Availability, ClassMeeting, Cycle, PA, Workshop } from '../types'

let cycle: Cycle = { ...seedCycle }
let classMeetings: ClassMeeting[] = seedClassMeetings.map((cm) => ({ ...cm }))
let pas: PA[] = seedPAs.map((pa) => ({ ...pa }))
let availabilities: Availability[] = seedAvailabilities.map((av) => ({ ...av }))
let workshops: Workshop[] = seedWorkshops.map((ws) => ({ ...ws }))
let assignments: Assignment[] = []
let idCounter = 1

export function getStore() {
  return { cycle, classMeetings, pas, availabilities, workshops, assignments }
}

export function nextId(): string {
  return `a-${idCounter++}`
}

export function updateWorkshops(updated: Workshop[]): void {
  workshops = updated
}

export function updateAssignments(updated: Assignment[]): void {
  assignments = updated
}

export function resetStore(): void {
  cycle = { ...seedCycle }
  classMeetings = seedClassMeetings.map((cm) => ({ ...cm }))
  pas = seedPAs.map((pa) => ({ ...pa }))
  availabilities = seedAvailabilities.map((av) => ({ ...av }))
  workshops = seedWorkshops.map((ws) => ({ ...ws }))
  assignments = []
  idCounter = 1
}
