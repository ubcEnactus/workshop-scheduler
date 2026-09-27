import { performance } from 'node:perf_hooks'
import { matchWorkshops } from '../src/lib/scheduling/matcher'
import type { ScheduleSnapshot, ScheduledWorkshop } from '../src/lib/scheduling/eligibility'
import { vancouverToUtc } from '../src/lib/time'

function scenario(
  name: string,
  sessionCount: number,
  paCount: number,
  weekCount: number,
  expected: 'COMPLETE' | 'PROVEN_SHORTAGE',
  minPAs = 1
) {
  const pas = Array.from({ length: paCount }, (_, index) => ({
    id: `pa-${index}`,
    name: null,
    email: `pa-${index}@bench`,
  }))
  const workshops: ScheduledWorkshop[] = Array.from({ length: sessionCount }, (_, index) => {
    const sessionsPerWeek = Math.ceil(sessionCount / weekCount)
    const week = Math.min(weekCount - 1, Math.floor(index / sessionsPerWeek))
    const day = 4 + week * 7 + (index % 5)
    const date = new Date(Date.UTC(2027, 0, day)).toISOString().slice(0, 10)
    return {
      id: `session-${index}`,
      classSectionId: `class-${index}`,
      schoolId: `school-${index}`,
      scheduledStart: vancouverToUtc(date, 600),
      scheduledEnd: vancouverToUtc(date, 660),
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
      Array.from({ length: 5 }, (_, dayOfWeek) =>
        Array.from({ length: 4 }, (_, offset) => ({
          userId: pa.id,
          dayOfWeek,
          startMin: 600 + offset * 15,
          effectiveFrom: '2020-01-01',
        }))
      ).flat()
    ),
    assignmentTotals: Object.fromEntries(pas.map((pa, index) => [pa.id, index % 7])),
    baselineAssignmentKeys: [],
  }
  matchWorkshops(
    snapshot,
    workshops.map((workshop) => workshop.id)
  )
  const samples = Array.from({ length: 5 }, () => {
    const start = performance.now()
    const plan = matchWorkshops(
      snapshot,
      workshops.map((workshop) => workshop.id)
    )
    if (plan[0]?.automaticOutcome !== expected) throw new Error(`${name}: expected ${expected}`)
    return {
      ms: performance.now() - start,
      outcome: plan[0]?.automaticOutcome ?? 'COMPLETE',
      diagnostics: plan[0]?.diagnostics,
    }
  })
  console.log(JSON.stringify({ name, sessionCount, paCount, weekCount, samples }))
}

scenario('same-week-9-sessions-8-pas', 9, 8, 1, 'PROVEN_SHORTAGE')
scenario('dense-shortage-60-sessions-30-pas', 60, 30, 1, 'PROVEN_SHORTAGE')
scenario('pilot-multi-pa-40-sessions-50-pas', 40, 50, 8, 'COMPLETE', 2)
scenario('stress-200-sessions-150-pas', 200, 150, 40, 'COMPLETE')
