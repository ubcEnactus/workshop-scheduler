import { describe, expect, it } from 'vitest'
import { vancouverToUtc } from '@/lib/time'
import { autoFillMissingPAs } from './auto-fill'
import type { ScheduleSnapshot, ScheduledWorkshop } from './eligibility'

let seed = 0xb219a4
function random(max: number) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return Math.floor((seed / 4294967296) * max)
}

describe('additive auto-fill independent exhaustive oracle', () => {
  it('agrees with legal residual-assignment enumeration over pinned teams, exclusions and external commitments', () => {
    seed = 0xb219a4
    for (let caseNumber = 0; caseNumber < 160; caseNumber += 1) {
      const paCount = 1 + random(4)
      const sessionCount = 1 + random(5)
      const pas = Array.from({ length: paCount }, (_, index) => ({
        id: `p${index}`,
        name: null,
        email: `p${index}@fixture.test`,
      }))
      const weeks = Array.from({ length: sessionCount }, () => random(2))
      const allowed = weeks.map(() => pas.map(() => random(4) !== 0))
      const excluded = weeks.map(() => pas.map(() => random(5) === 0))
      const workshops: ScheduledWorkshop[] = weeks.map((week, index) => {
        const minPAs = 1 + random(Math.min(paCount + 1, 3))
        const fixedPA = random(paCount)
        return {
          id: `s${index}`,
          classSectionId: `c${index}`,
          schoolId: `school${index}`,
          scheduledStart: vancouverToUtc(week ? '2027-01-11' : '2027-01-04', 540 + index * 60),
          scheduledEnd: vancouverToUtc(week ? '2027-01-11' : '2027-01-04', 600 + index * 60),
          minPAs,
          maxPAs: minPAs + random(3),
          status: random(10) === 0 ? 'PUBLISHED' : 'DRAFT',
          version: random(5),
          locked: random(8) === 0,
          activeClass: true,
          hostingValid: true,
          assignments:
            random(3) === 0
              ? [
                  {
                    paId: pas[fixedPA].id,
                    source: random(2) ? 'MANUAL' : 'AUTOMATIC',
                    status: 'DRAFT',
                    overrideAvailability: true,
                    overrideSameDay: true,
                    overrideWeek: true,
                    overrideReason: null,
                  },
                ]
              : [],
        }
      })
      const externalWeeks = pas.map(() => random(3) - 1)
      const external = pas.flatMap((pa, index): ScheduledWorkshop[] =>
        externalWeeks[index] < 0
          ? []
          : [
              {
                id: `external-${index}`,
                classSectionId: `external-class-${index}`,
                schoolId: `external-school-${index}`,
                scheduledStart: vancouverToUtc(
                  externalWeeks[index] ? '2027-01-12' : '2027-01-05',
                  600
                ),
                scheduledEnd: vancouverToUtc(
                  externalWeeks[index] ? '2027-01-12' : '2027-01-05',
                  660
                ),
                minPAs: 1,
                maxPAs: 1,
                status: caseNumber % 7 === 0 ? 'CANCELLED' : 'COMPLETED',
                version: 1,
                locked: true,
                activeClass: true,
                assignments: [{ paId: pa.id, status: 'PUBLISHED', source: 'MANUAL' }],
              },
            ]
      )
      const snapshot: ScheduleSnapshot = {
        minimumGapDays: null,
        quotas: [],
        pas,
        workshops: [...workshops, ...external],
        availability: pas.flatMap((pa) =>
          Array.from({ length: 28 }, (_, index) => ({
            userId: pa.id,
            dayOfWeek: 0,
            startMin: 480 + index * 15,
            effectiveFrom: '2020-01-01',
          }))
        ),
        availabilityExceptions: workshops.flatMap((workshop, session) =>
          pas
            .filter((_, pa) => !allowed[session][pa])
            .map((pa) => ({
              userId: pa.id,
              date: workshop.scheduledStart,
              kind: 'UNAVAILABLE',
              startMinute: 540 + session * 60,
              endMinute: 600 + session * 60,
            }))
        ),
      }
      const exclusions = Object.fromEntries(
        workshops.map((workshop, session) => [
          workshop.id,
          pas.filter((_, pa) => excluded[session][pa]).map((pa) => pa.id),
        ])
      )
      const active = workshops.map((workshop) => workshop.status === 'DRAFT' && !workshop.locked)
      const counts = workshops.map((workshop) => workshop.assignments.length)
      const occupied = new Set(
        workshops.flatMap((workshop, index) =>
          workshop.assignments.map((assignment) => `${weeks[index]}:${assignment.paId}`)
        )
      )
      for (const row of external) {
        if (row.status === 'CANCELLED') continue
        const pa = pas.findIndex((person) => person.id === row.assignments[0].paId)
        occupied.add(`${externalWeeks[pa]}:${pas[pa].id}`)
      }
      const decisions = [0, 1].flatMap((week) =>
        pas
          .map((pa, index) => ({ week, pa: index, key: `${week}:${pa.id}` }))
          .filter((decision) => !occupied.has(decision.key))
      )
      // Independent policy model: one new assignment per free PA-week, only
      // allowed/unexcluded session edges, with existing teams counted in place.
      const enumerate = (depth: number): boolean => {
        if (
          workshops.every((workshop, index) => !active[index] || counts[index] >= workshop.minPAs)
        )
          return true
        if (depth === decisions.length) return false
        if (enumerate(depth + 1)) return true
        const { week, pa } = decisions[depth]
        for (let session = 0; session < workshops.length; session += 1) {
          if (
            !active[session] ||
            weeks[session] !== week ||
            !allowed[session][pa] ||
            excluded[session][pa] ||
            counts[session] >= workshops[session].minPAs
          )
            continue
          counts[session] += 1
          const complete = enumerate(depth + 1)
          counts[session] -= 1
          if (complete) return true
        }
        return false
      }
      const feasible = enumerate(0)
      const before = JSON.stringify(snapshot)
      const result = autoFillMissingPAs(
        snapshot,
        workshops.map((workshop) => workshop.id),
        exclusions
      )
      const description = `case ${caseNumber}: ${JSON.stringify({ weeks, allowed, excluded, occupied: [...occupied], minima: workshops.map((workshop) => workshop.minPAs), result })}`
      expect(result.outcome === 'COMPLETE', description).toBe(feasible)
      expect(JSON.stringify(snapshot)).toBe(before)
      expect(result.excludedSessionIds).toEqual(
        workshops
          .filter((_, index) => !active[index])
          .map((workshop) => workshop.id)
          .sort()
      )
      const finalCounts = workshops.map((workshop) => workshop.assignments.length)
      const used = new Set(occupied)
      for (const addition of result.additions) {
        const session = workshops.findIndex(
          (workshop) => workshop.id === addition.workshopSessionId
        )
        const pa = pas.findIndex((person) => person.id === addition.paId)
        expect(session, description).toBeGreaterThanOrEqual(0)
        expect(active[session], description).toBe(true)
        expect(allowed[session][pa], description).toBe(true)
        expect(excluded[session][pa], description).toBe(false)
        const decision = `${weeks[session]}:${addition.paId}`
        expect(used.has(decision), description).toBe(false)
        used.add(decision)
        finalCounts[session] += 1
        expect(finalCounts[session], description).toBeLessThanOrEqual(workshops[session].minPAs)
      }
      expect(result.remainingSessionIds).toEqual(
        workshops
          .filter((workshop, index) => active[index] && finalCounts[index] < workshop.minPAs)
          .map((workshop) => workshop.id)
          .sort()
      )
      expect(
        autoFillMissingPAs(
          { ...snapshot, workshops: [...snapshot.workshops].reverse(), pas: [...pas].reverse() },
          [...workshops].reverse().map((workshop) => workshop.id),
          exclusions
        )
      ).toEqual(result)
    }
  })
})
