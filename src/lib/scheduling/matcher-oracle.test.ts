import { describe, expect, it } from 'vitest'
import { matchWorkshops } from './matcher'
import type { ScheduleSnapshot, ScheduledWorkshop } from './eligibility'
import { vancouverToUtc } from '@/lib/time'

let seed = 0x738d29
const random = (max: number) => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return Math.floor((seed / 4294967296) * max)
}

describe('exact matcher independent exhaustive oracle', () => {
  it('agrees with direct legal assignment enumeration on 120 seeded policy fixtures', () => {
    seed = 0x738d29
    for (let caseNumber = 0; caseNumber < 120; caseNumber += 1) {
      const paCount = 1 + random(4)
      const sessionCount = 1 + random(5)
      const pas = Array.from({ length: paCount }, (_, index) => ({
        id: `p${index}`,
        name: null,
        email: `p${index}@test`,
      }))
      const weeks = Array.from({ length: sessionCount }, (_, index) =>
        caseNumber % 3 === 0 && index % 2 ? 1 : 0
      )
      const allowed = weeks.map(() => pas.map(() => random(4) !== 0))
      const workshops: ScheduledWorkshop[] = weeks.map((week, index) => {
        const minPAs = 1 + random(Math.min(paCount + 1, 3))
        return {
          id: `s${index}`,
          classSectionId: `c${index}`,
          schoolId: `school${index}`,
          scheduledStart: vancouverToUtc(week ? '2027-01-11' : '2027-01-04', 540 + index * 60),
          scheduledEnd: vancouverToUtc(week ? '2027-01-11' : '2027-01-04', 600 + index * 60),
          minPAs,
          maxPAs: minPAs,
          status: 'DRAFT',
          version: 0,
          locked: false,
          activeClass: true,
          assignments: [],
        }
      })
      const snapshot: ScheduleSnapshot = {
        minimumGapDays: null,
        quotas: [],
        pas,
        workshops,
        availability: pas.flatMap((pa) =>
          Array.from({ length: 24 }, (_, index) => ({
            userId: pa.id,
            dayOfWeek: 0,
            startMin: 540 + index * 15,
            effectiveFrom: '2020-01-01',
          }))
        ),
        availabilityExceptions: workshops.flatMap((workshop, session) =>
          pas
            .filter((_, pa) => !allowed[session][pa])
            .map((pa) => ({
              userId: pa.id,
              date: workshop.scheduledStart,
              kind: 'UNAVAILABLE' as const,
              startMinute: 540 + session * 60,
              endMinute: 600 + session * 60,
            }))
        ),
      }
      const counts = workshops.map(() => 0)
      const decisions = [...new Set(weeks)].flatMap((week) => pas.map((_, pa) => ({ week, pa })))
      let feasible = false
      const enumerate = (depth: number) => {
        if (depth === decisions.length) {
          feasible ||= workshops.every((workshop, index) => counts[index] >= workshop.minPAs)
          return
        }
        enumerate(depth + 1)
        const { week, pa } = decisions[depth]
        for (let session = 0; session < workshops.length; session += 1)
          if (
            weeks[session] === week &&
            allowed[session][pa] &&
            counts[session] < workshops[session].maxPAs
          ) {
            counts[session] += 1
            enumerate(depth + 1)
            counts[session] -= 1
          }
      }
      enumerate(0)
      const before = JSON.stringify(snapshot)
      const plan = matchWorkshops(
        snapshot,
        workshops.map((workshop) => workshop.id)
      )
      expect(JSON.stringify(snapshot)).toBe(before)
      expect(
        plan.every((proposal) => proposal.automaticOutcome === 'COMPLETE'),
        `case ${caseNumber}: ${JSON.stringify({ weeks, allowed, minima: workshops.map((workshop) => workshop.minPAs), plan })}`
      ).toBe(feasible)
      const used = new Set<string>()
      for (const proposal of plan) {
        const workshop = workshops.find((item) => item.id === proposal.workshopSessionId)!
        expect(proposal.paIds.length).toBeLessThanOrEqual(workshop.maxPAs)
        if (feasible) expect(proposal.paIds.length).toBeGreaterThanOrEqual(workshop.minPAs)
        for (const paId of proposal.paIds) {
          const session = workshops.findIndex(
            (workshop) => workshop.id === proposal.workshopSessionId
          )
          const pa = pas.findIndex((candidate) => candidate.id === paId)
          expect(allowed[session][pa]).toBe(true)
          expect(used.has(`${weeks[session]}:${paId}`)).toBe(false)
          used.add(`${weeks[session]}:${paId}`)
        }
      }
    }
  })
})
