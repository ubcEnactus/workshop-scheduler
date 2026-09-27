import { vancouverDateKey } from '@/lib/time'
import {
  assessAssignment,
  mondayFridayWeekKey,
  totalAssignments,
  type ScheduleSnapshot,
} from './eligibility'
import { minCostMaximumFlow, type FlowEdgeInput } from './exact-flow'

export type AutoFillAddition = { workshopSessionId: string; paId: string }
export type AutoFillResult = {
  additions: AutoFillAddition[]
  /** Feasibility of the remaining automatic demand, not publication readiness. */
  outcome: 'COMPLETE' | 'PROVEN_SHORTAGE'
  remainingSessionIds: string[]
  /** Missing, non-draft or auto-fill-disabled targets; not part of the demand. */
  excludedSessionIds: string[]
}

type Target = {
  id: string
  week: string | null
  needed: number
  capacity: number
  paIds: string[]
}
type Context = {
  targets: Target[]
  workload: ReadonlyMap<string, number>
  weeks: ReadonlyMap<string, string | null>
}

const key = (paId: string, week: string) => JSON.stringify([paId, week])
const ordered = (additions: readonly AutoFillAddition[]) =>
  [...additions].sort(
    (a, b) => a.workshopSessionId.localeCompare(b.workshopSessionId) || a.paId.localeCompare(b.paId)
  )

function usage(context: Context, additions: readonly AutoFillAddition[]) {
  const occupied = new Set<string>()
  const counts = new Map<string, number>()
  for (const addition of additions) {
    const week = context.weeks.get(addition.workshopSessionId)
    if (week) occupied.add(key(addition.paId, week))
    counts.set(addition.paId, (counts.get(addition.paId) ?? 0) + 1)
  }
  return { occupied, counts }
}

/** All edges are relative to the immutable existing teams. Fixed additions consume new PA-weeks. */
function solve(
  context: Context,
  targets: readonly Target[],
  fixed: readonly AutoFillAddition[] = []
) {
  const { occupied, counts } = usage(context, fixed)
  const edges: FlowEdgeInput[] = []
  const assignmentEdges: { index: number; addition: AutoFillAddition }[] = []
  const weeksByPA = new Map<string, Set<string>>()
  for (const target of targets) {
    if (!target.week || !target.capacity) continue
    for (const paId of target.paIds) {
      if (occupied.has(key(paId, target.week))) continue
      const weeks = weeksByPA.get(paId) ?? new Set<string>()
      weeks.add(target.week)
      weeksByPA.set(paId, weeks)
    }
  }
  for (const [paId, availableWeeks] of [...weeksByPA].sort(([a], [b]) => a.localeCompare(b))) {
    const weeks = [...availableWeeks].sort()
    // Bound the network by usable PA-weeks, never by a declared staffing minimum.
    for (let place = 0; place < weeks.length; place += 1)
      edges.push({
        from: '0:source',
        to: `1:pa:${paId}`,
        capacity: 1,
        cost: (context.workload.get(paId) ?? 0) + (counts.get(paId) ?? 0) + place,
      })
    for (const week of weeks)
      edges.push({ from: `1:pa:${paId}`, to: `2:pa-week:${key(paId, week)}`, capacity: 1 })
  }
  for (const target of [...targets].sort((a, b) => a.id.localeCompare(b.id))) {
    edges.push({ from: `3:session:${target.id}`, to: '9:sink', capacity: target.capacity })
    if (!target.week) continue
    for (const paId of target.paIds) {
      if (occupied.has(key(paId, target.week))) continue
      assignmentEdges.push({
        index: edges.length,
        addition: { workshopSessionId: target.id, paId },
      })
      edges.push({
        from: `2:pa-week:${key(paId, target.week)}`,
        to: `3:session:${target.id}`,
        capacity: 1,
      })
    }
  }
  const result = minCostMaximumFlow('0:source', '9:sink', edges)
  return {
    complete: result.flow === targets.reduce((sum, target) => sum + target.needed, 0),
    additions: assignmentEdges
      .filter((assignment) => result.edgeFlows[assignment.index] > 0)
      .map((assignment) => assignment.addition),
  }
}

function greedy(context: Context, targets: readonly Target[], reverseTies = false) {
  const additions: AutoFillAddition[] = []
  const occupied = new Set<string>()
  const counts = new Map<string, number>()
  for (const target of targets) {
    const week = target.week
    if (!week) continue
    const candidates = target.paIds
      .filter((paId) => !occupied.has(key(paId, week)))
      .sort(
        (a, b) =>
          (context.workload.get(a) ?? 0) +
            (counts.get(a) ?? 0) -
            (context.workload.get(b) ?? 0) -
            (counts.get(b) ?? 0) || (reverseTies ? b.localeCompare(a) : a.localeCompare(b))
      )
    for (const paId of candidates.slice(0, target.capacity)) {
      additions.push({ workshopSessionId: target.id, paId })
      occupied.add(key(paId, week))
      counts.set(paId, (counts.get(paId) ?? 0) + 1)
    }
  }
  return additions
}

function completionFirst(context: Context, targets: readonly Target[]) {
  const chosen: Target[] = []
  for (const target of targets)
    if (solve(context, [...chosen, target]).complete) chosen.push(target)
  const complete = solve(context, chosen).additions
  const chosenIds = new Set(chosen.map((target) => target.id))
  const remaining = targets.filter((target) => !chosenIds.has(target.id))
  return [...complete, ...solve(context, remaining, complete).additions]
}

/**
 * Repeated repair is optional quality improvement, not the feasibility proof.
 * Bound its total estimated edge/augmentation work deterministically, rather
 * than using a clock cutoff that could change the result between retries.
 * Every repair solve is a subgraph of the initial graph and adds at most one
 * assignment per usable PA-week. Three sweeps each make at most N + 2 solves.
 */
function canRefineCompletion(targets: readonly Target[]) {
  const paWeeks = new Set<string>()
  let assignmentEdges = 0
  let capacity = 0
  for (const target of targets) {
    capacity += target.capacity
    if (!target.week || !target.capacity) continue
    assignmentEdges += target.paIds.length
    for (const paId of target.paIds) paWeeks.add(key(paId, target.week))
  }
  const edges = targets.length + assignmentEdges + 2 * paWeeks.size
  const augmentations = Math.max(1, Math.min(capacity, paWeeks.size))
  const repairSolves = 3 * (targets.length + 2)
  return edges * augmentations * repairSolves <= 2_000_000
}

function score(context: Context, additions: readonly AutoFillAddition[]) {
  const counts = new Map<string, number>()
  for (const addition of additions)
    counts.set(addition.workshopSessionId, (counts.get(addition.workshopSessionId) ?? 0) + 1)
  const paCounts = usage(context, additions).counts
  return {
    complete: context.targets.filter((target) => (counts.get(target.id) ?? 0) >= target.needed)
      .length,
    places: additions.length,
    fairness: [...paCounts].reduce(
      (sum, [paId, count]) =>
        sum + count * (context.workload.get(paId) ?? 0) + (count * (count - 1)) / 2,
      0
    ),
    identity: JSON.stringify(ordered(additions)),
  }
}

/**
 * Fill only residual minimums, with every existing assignment pinned in place.
 * Exact flow proves full-minimum feasibility under those fixed choices. If it is
 * impossible, deterministic completion-first candidates improve the partial
 * result without claiming an optimal number of completed sessions. This pure
 * helper neither mutates its input nor writes dates, teams or override flags.
 */
export function autoFillMissingPAs(
  snapshot: ScheduleSnapshot,
  targetIds: readonly string[],
  exclusions: Readonly<Record<string, readonly string[]>> = {}
): AutoFillResult {
  const workshops = new Map(snapshot.workshops.map((workshop) => [workshop.id, workshop]))
  const targets: Target[] = []
  const excludedSessionIds: string[] = []
  const pas = [...snapshot.pas].sort((a, b) => a.id.localeCompare(b.id))
  for (const id of [...new Set(targetIds)].sort()) {
    const workshop = workshops.get(id)
    if (!workshop || workshop.status !== 'DRAFT' || workshop.locked) {
      excludedSessionIds.push(id)
      continue
    }
    const needed = Math.max(0, workshop.minPAs - workshop.assignments.length)
    if (!needed) continue
    const unavailable = new Set([
      ...workshop.assignments.map((assignment) => assignment.paId),
      ...(exclusions[id] ?? []),
    ])
    targets.push({
      id,
      needed,
      capacity: Math.min(needed, Math.max(0, workshop.maxPAs - workshop.assignments.length)),
      week: mondayFridayWeekKey(vancouverDateKey(workshop.scheduledStart)),
      paIds: pas
        .filter(
          (pa) =>
            !unavailable.has(pa.id) && assessAssignment(snapshot, workshop, pa.id).automaticEligible
        )
        .map((pa) => pa.id),
    })
  }
  const context: Context = {
    targets,
    workload: new Map(pas.map((pa) => [pa.id, totalAssignments(snapshot, pa.id)])),
    weeks: new Map(targets.map((target) => [target.id, target.week])),
  }
  const exact = solve(context, targets)
  let additions = exact.additions
  if (!exact.complete) {
    const orders = [
      (a: Target, b: Target) => a.paIds.length - b.paIds.length || a.id.localeCompare(b.id),
      (a: Target, b: Target) =>
        a.needed - b.needed || a.paIds.length - b.paIds.length || a.id.localeCompare(b.id),
      (a: Target, b: Target) =>
        a.paIds.length / a.needed - b.paIds.length / b.needed ||
        a.needed - b.needed ||
        a.id.localeCompare(b.id),
    ].map((compare) => [...targets].sort(compare))
    additions = [
      exact.additions,
      ...orders.map((order) => greedy(context, order)),
      greedy(context, orders[1], true),
      ...(canRefineCompletion(targets)
        ? orders.map((order) => completionFirst(context, order))
        : []),
    ]
      .map((candidate) => ({ candidate, score: score(context, candidate) }))
      .sort(
        (a, b) =>
          b.score.complete - a.score.complete ||
          b.score.places - a.score.places ||
          a.score.fairness - b.score.fairness ||
          a.score.identity.localeCompare(b.score.identity)
      )[0].candidate
  }
  const addedCounts = new Map<string, number>()
  for (const addition of additions)
    addedCounts.set(
      addition.workshopSessionId,
      (addedCounts.get(addition.workshopSessionId) ?? 0) + 1
    )
  return {
    additions: ordered(additions),
    outcome: exact.complete ? 'COMPLETE' : 'PROVEN_SHORTAGE',
    remainingSessionIds: targets
      .filter((target) => (addedCounts.get(target.id) ?? 0) < target.needed)
      .map((target) => target.id),
    excludedSessionIds,
  }
}
