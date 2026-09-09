import { eligibility, workload, type ScheduleSnapshot, type ScheduledWorkshop } from './eligibility'
import { vancouverMonthKey } from '@/lib/time'

export type MatchProposal = {
  workshopId: string
  paIds: string[]
  protected: boolean
  reasons: string[]
}
export function protectionReason(w: ScheduledWorkshop) {
  if (w.status !== 'DRAFT') return 'Published or historical workshop is protected.'
  if (w.locked) return 'Workshop is locked.'
  if (w.assignments.some((a) => a.source === 'MANUAL')) return 'Manual staffing is protected.'
  return null
}

// Pure: returns assignments and explanations only. Dates are neither changed nor output.
export function matchWorkshops(
  input: ScheduleSnapshot,
  targetIds: readonly string[]
): MatchProposal[] {
  const snapshot: ScheduleSnapshot = {
    ...input,
    workshops: input.workshops.map((w) => ({
      ...w,
      assignments: w.assignments.map((a) => ({ ...a })),
    })),
  }
  const targets = snapshot.workshops
    .filter((w) => targetIds.includes(w.id))
    .sort((a, b) => a.id.localeCompare(b.id))
  const mutable = targets.filter((w) => !protectionReason(w))
  for (const w of mutable) w.assignments = []
  const eligible = (w: ScheduledWorkshop) =>
    snapshot.pas.filter(
      (pa) =>
        !w.assignments.some((a) => a.paId === pa.id) && eligibility(snapshot, w, pa.id).length === 0
    )
  mutable.sort(
    (a, b) =>
      eligible(a).length - eligible(b).length ||
      a.scheduledStart.getTime() - b.scheduledStart.getTime() ||
      a.id.localeCompare(b.id)
  )
  for (const limit of ['minPAs', 'maxPAs'] as const) {
    for (const w of mutable) {
      while (w.assignments.length < w[limit]) {
        const month = vancouverMonthKey(w.scheduledStart)
        const quota = (id: string) =>
          snapshot.quotas.find((q) => q.paId === id && q.month === month)!.quota
        const candidates = eligible(w).sort(
          (a, b) =>
            workload(snapshot, a.id, month) / quota(a.id) -
              workload(snapshot, b.id, month) / quota(b.id) ||
            workload(snapshot, a.id, month) - workload(snapshot, b.id, month) ||
            a.id.localeCompare(b.id)
        )
        if (!candidates.length) break
        w.assignments.push({ paId: candidates[0].id, status: 'DRAFT', source: 'AUTOMATIC' })
      }
    }
  }
  return targets.map((w) => {
    const protection = protectionReason(w)
    const reasons = protection ? [protection] : []
    if (!protection && w.assignments.length < w.maxPAs) {
      if (w.assignments.length < w.minPAs) reasons.push('Minimum staffing is not met.')
      if (!snapshot.pas.length) reasons.push('No active PAs.')
      for (const pa of snapshot.pas.filter((p) => !w.assignments.some((a) => a.paId === p.id))) {
        const why = eligibility(snapshot, w, pa.id)
        if (why.length) reasons.push((pa.name ?? pa.email) + ': ' + why.join(' '))
      }
    }
    return {
      workshopId: w.id,
      paIds: w.assignments.map((a) => a.paId).sort(),
      protected: !!protection,
      reasons,
    }
  })
}
