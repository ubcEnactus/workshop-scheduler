import {
  assessAssignment,
  mondayFridayWeekKey,
  totalAssignments,
  type ScheduleSnapshot,
  type ScheduledWorkshop,
} from './eligibility'
import { minCostMaximumFlow, type FlowDiagnostics, type FlowEdgeInput } from './exact-flow'
import { vancouverDateKey } from '@/lib/time'

export type AutomaticOutcome = 'COMPLETE' | 'PROVEN_SHORTAGE'
export type ShortageWitness = {
  targetSessionIds: string[]
  requiredPlaces: number
  filledPlaces: number
  deficit: number
}
export type MatchProposal = {
  planVersion: 2
  workshopSessionId: string
  paIds: string[]
  protected: boolean
  reasons: string[]
  automaticOutcome: AutomaticOutcome
  protectedDeficit: boolean
  shortageWitness?: ShortageWitness
  diagnostics: FlowDiagnostics
}

export function protectionReason(workshop: ScheduledWorkshop) {
  if (workshop.status !== 'DRAFT') return 'Published or historical workshop is protected.'
  if (workshop.locked) return 'Workshop is locked.'
  if (workshop.assignments.some((assignment) => assignment.source === 'MANUAL'))
    return 'Manual staffing is protected.'
  return null
}

function cloneSnapshot(input: ScheduleSnapshot): ScheduleSnapshot {
  return {
    ...input,
    availability: input.availability.map((slot) => ({ ...slot })),
    availabilityExceptions: input.availabilityExceptions?.map((item) => ({ ...item })),
    quotas: input.quotas.map((quota) => ({ ...quota })),
    pas: input.pas.map((pa) => ({ ...pa })),
    workshops: input.workshops.map((workshop) => ({
      ...workshop,
      scheduledStart: new Date(workshop.scheduledStart),
      scheduledEnd: new Date(workshop.scheduledEnd),
      assignments: workshop.assignments.map((assignment) => ({ ...assignment })),
    })),
  }
}

function addAutomatic(workshop: ScheduledWorkshop, paId: string) {
  workshop.assignments.push({
    paId,
    status: 'DRAFT',
    source: 'AUTOMATIC',
    overrideSameDay: false,
    overrideWeek: false,
    overrideReason: null,
  })
}

type Network = {
  edges: FlowEdgeInput[]
  assignmentEdges: { edgeIndex: number; paId: string; sessionId: string }[]
  demand: number
}
type EligibilityModel = { eligible: Map<string, string[]>; week: Map<string, string | null> }

function buildEligibilityModel(
  snapshot: ScheduleSnapshot,
  sessions: readonly ScheduledWorkshop[]
): EligibilityModel {
  return {
    eligible: new Map(
      sessions.map((session) => [
        session.id,
        snapshot.pas
          .filter((pa) => assessAssignment(snapshot, session, pa.id).automaticEligible)
          .map((pa) => pa.id)
          .sort(),
      ])
    ),
    week: new Map(
      sessions.map((session) => [
        session.id,
        mondayFridayWeekKey(vancouverDateKey(session.scheduledStart)),
      ])
    ),
  }
}

function buildNetwork(
  snapshot: ScheduleSnapshot,
  sessions: readonly ScheduledWorkshop[],
  model: EligibilityModel,
  blocked = new Set<string>()
): Network {
  const edges: FlowEdgeInput[] = []
  const assignmentEdges: Network['assignmentEdges'] = []
  const weeksByPA = new Map<string, Set<string>>()
  for (const session of sessions) {
    const week = model.week.get(session.id)
    if (!week) continue
    for (const paId of model.eligible.get(session.id) ?? [])
      if (!blocked.has(`${paId}:${week}`)) {
        const weeks = weeksByPA.get(paId) ?? new Set<string>()
        weeks.add(week)
        weeksByPA.set(paId, weeks)
      }
  }
  for (const pa of [...snapshot.pas].sort((a, b) => a.id.localeCompare(b.id))) {
    const weeks = [...(weeksByPA.get(pa.id) ?? [])].sort()
    // One marginal edge per usable PA-week, never per declared staffing demand.
    for (let place = 0; place < weeks.length; place += 1)
      edges.push({
        from: '0:source',
        to: `1:pa:${pa.id}`,
        capacity: 1,
        cost: totalAssignments(snapshot, pa.id) + place,
      })
    for (const week of weeks)
      edges.push({ from: `1:pa:${pa.id}`, to: `2:pa-week:${pa.id}:${week}`, capacity: 1 })
  }
  let demand = 0
  for (const session of [...sessions].sort((a, b) => a.id.localeCompare(b.id))) {
    const needed = Math.max(0, session.minPAs - session.assignments.length)
    demand += needed
    edges.push({ from: `3:session:${session.id}`, to: '9:sink', capacity: needed })
    const week = model.week.get(session.id)
    if (!week) continue
    for (const paId of model.eligible.get(session.id) ?? [])
      if (!blocked.has(`${paId}:${week}`)) {
        const edgeIndex = edges.length
        edges.push({
          from: `2:pa-week:${paId}:${week}`,
          to: `3:session:${session.id}`,
          capacity: 1,
        })
        assignmentEdges.push({ edgeIndex, paId, sessionId: session.id })
      }
  }
  return { edges, assignmentEdges, demand }
}

function solveMinimum(
  snapshot: ScheduleSnapshot,
  sessions: ScheduledWorkshop[],
  model: EligibilityModel,
  blocked?: Set<string>
) {
  const network = buildNetwork(snapshot, sessions, model, blocked)
  const result = minCostMaximumFlow('0:source', '9:sink', network.edges)
  for (const assignment of network.assignmentEdges)
    if (result.edgeFlows[assignment.edgeIndex] > 0)
      addAutomatic(
        sessions.find((session) => session.id === assignment.sessionId)!,
        assignment.paId
      )
  return {
    complete: result.flow === network.demand,
    witness: {
      targetSessionIds: sessions.map((session) => session.id).sort(),
      requiredPlaces: network.demand,
      filledPlaces: result.flow,
      deficit: network.demand - result.flow,
    },
    diagnostics: result.diagnostics,
  }
}

function feasible(
  snapshot: ScheduleSnapshot,
  sessions: readonly ScheduledWorkshop[],
  model: EligibilityModel
) {
  const network = buildNetwork(snapshot, sessions, model)
  return minCostMaximumFlow('0:source', '9:sink', network.edges).flow === network.demand
}

function candidates(snapshot: ScheduleSnapshot, session: ScheduledWorkshop) {
  return snapshot.pas
    .filter(
      (pa) =>
        !session.assignments.some((assignment) => assignment.paId === pa.id) &&
        assessAssignment(snapshot, session, pa.id).automaticEligible
    )
    .sort(
      (a, b) =>
        totalAssignments(snapshot, a.id) - totalAssignments(snapshot, b.id) ||
        a.id.localeCompare(b.id)
    )
}

function planScore(sessions: readonly ScheduledWorkshop[]) {
  return {
    covered: sessions.filter((session) => session.assignments.length >= session.minPAs).length,
    deficit: sessions.reduce(
      (sum, session) => sum + Math.max(0, session.minPAs - session.assignments.length),
      0
    ),
  }
}

function assignmentState(sessions: readonly ScheduledWorkshop[]) {
  return new Map(
    sessions.map((session) => [
      session.id,
      session.assignments.map((assignment) => ({ ...assignment })),
    ])
  )
}

function restoreState(
  sessions: readonly ScheduledWorkshop[],
  state: Map<string, ScheduledWorkshop['assignments']>
) {
  for (const session of sessions)
    session.assignments = state.get(session.id)?.map((assignment) => ({ ...assignment })) ?? []
}

function greedyIncumbent(
  snapshot: ScheduleSnapshot,
  sessions: readonly ScheduledWorkshop[],
  compare: (a: ScheduledWorkshop, b: ScheduledWorkshop) => number,
  reverseTies = false
) {
  for (const session of sessions) session.assignments = []
  for (const session of [...sessions].sort(compare)) {
    const choices = candidates(snapshot, session)
    if (reverseTies) choices.reverse()
    for (const pa of choices) {
      if (session.assignments.length >= session.minPAs) break
      addAutomatic(session, pa.id)
    }
  }
  return { state: assignmentState(sessions), score: planScore(sessions) }
}

/** Exact full-minimum feasibility plus deterministic completion-first partial planning. */
export function matchWorkshops(
  input: ScheduleSnapshot,
  targetIds: readonly string[]
): MatchProposal[] {
  const snapshot = cloneSnapshot(input)
  const targets = snapshot.workshops
    .filter((session) => targetIds.includes(session.id))
    .sort((a, b) => a.id.localeCompare(b.id))
  const mutable = targets.filter((session) => !protectionReason(session))
  for (const session of mutable) session.assignments = []
  const model = buildEligibilityModel(snapshot, mutable)
  const solved = solveMinimum(snapshot, mutable, model)
  if (!solved.complete) {
    const maximumPlaceSeed = { state: assignmentState(mutable), score: planScore(mutable) }
    const seedOrders = [
      (a: ScheduledWorkshop, b: ScheduledWorkshop) =>
        (model.eligible.get(a.id)?.length ?? 0) - (model.eligible.get(b.id)?.length ?? 0) ||
        a.id.localeCompare(b.id),
      (a: ScheduledWorkshop, b: ScheduledWorkshop) =>
        a.minPAs - b.minPAs ||
        (model.eligible.get(a.id)?.length ?? 0) - (model.eligible.get(b.id)?.length ?? 0) ||
        a.id.localeCompare(b.id),
      (a: ScheduledWorkshop, b: ScheduledWorkshop) =>
        (model.eligible.get(a.id)?.length ?? 0) / Math.max(1, a.minPAs) -
          (model.eligible.get(b.id)?.length ?? 0) / Math.max(1, b.minPAs) ||
        a.minPAs - b.minPAs ||
        a.id.localeCompare(b.id),
    ]
    const bestSeed = [
      maximumPlaceSeed,
      ...seedOrders.map((order) => greedyIncumbent(snapshot, mutable, order)),
      greedyIncumbent(snapshot, mutable, seedOrders[1], true),
    ].sort((a, b) => b.score.covered - a.score.covered || a.score.deficit - b.score.deficit)[0]
    const incumbent = bestSeed.state
    const incumbentScore = bestSeed.score
    const repair = (order: (a: ScheduledWorkshop, b: ScheduledWorkshop) => number) => {
      for (const session of mutable) session.assignments = []
      const chosen: ScheduledWorkshop[] = []
      const ordered = [...mutable].sort(order)
      for (const session of ordered)
        if (feasible(snapshot, [...chosen, session], model)) chosen.push(session)
      solveMinimum(snapshot, chosen, model)
      const remaining = ordered.filter((session) => !chosen.includes(session))
      const blocked = new Set(
        chosen.flatMap((session) =>
          session.assignments.map(
            (assignment) => `${assignment.paId}:${model.week.get(session.id)}`
          )
        )
      )
      solveMinimum(snapshot, remaining, model, blocked)
      return { state: assignmentState(mutable), score: planScore(mutable) }
    }
    const best = [
      { state: incumbent, score: incumbentScore },
      repair(seedOrders[0]),
      repair(seedOrders[1]),
      repair(seedOrders[2]),
    ].sort((a, b) => b.score.covered - a.score.covered || a.score.deficit - b.score.deficit)[0]
    restoreState(mutable, best.state)
  }
  for (const session of mutable)
    if (session.assignments.length < session.maxPAs)
      for (const pa of candidates(snapshot, session)) {
        if (session.assignments.length >= session.maxPAs) break
        addAutomatic(session, pa.id)
      }
  const outcome: AutomaticOutcome = solved.complete ? 'COMPLETE' : 'PROVEN_SHORTAGE'
  return targets.map((session) => {
    const protection = protectionReason(session)
    const reasons = protection ? [protection] : []
    if (session.assignments.length < session.minPAs)
      reasons.push(
        protection
          ? 'Protected session needs an admin edit.'
          : 'Insufficient eligible PA capacity under automatic weekly rules.'
      )
    if (!snapshot.pas.length && session.assignments.length < session.minPAs)
      reasons.push('No active PAs.')
    if (!protection && session.assignments.length < session.minPAs)
      for (const pa of snapshot.pas.filter(
        (candidate) => !session.assignments.some((assignment) => assignment.paId === candidate.id)
      )) {
        const assessment = assessAssignment(snapshot, session, pa.id)
        const details = [
          ...assessment.hardErrors,
          ...assessment.availabilityWarnings,
          ...assessment.manualWarnings.map((warning) => warning.message),
        ]
        if (details.length) reasons.push(`${pa.name ?? pa.email}: ${details.join(' ')}`)
      }
    return {
      planVersion: 2,
      workshopSessionId: session.id,
      paIds: session.assignments.map((assignment) => assignment.paId).sort(),
      protected: Boolean(protection),
      reasons: [...new Set(reasons)],
      automaticOutcome: outcome,
      protectedDeficit: Boolean(protection && session.assignments.length < session.minPAs),
      shortageWitness: solved.complete ? undefined : solved.witness,
      diagnostics: solved.diagnostics,
    }
  })
}
