import type { Prisma } from '@prisma/client'
import type { ChangeRequest } from '@/lib/schemas/changes'
import { workshopSchema } from '@/lib/schemas/workshops'
import { eligibility, type ScheduleSnapshot, type ScheduledWorkshop } from './eligibility'
import { validateSlot, SchedulingError } from './store'

export function auditState(w: ScheduledWorkshop, snapshot: ScheduleSnapshot) {
  return {
    status: w.status,
    start: w.scheduledStart.toISOString(),
    end: w.scheduledEnd.toISOString(),
    pas: w.assignments.map((a) => ({
      id: a.paId,
      name:
        snapshot.pas.find((p) => p.id === a.paId)?.name ??
        snapshot.pas.find((p) => p.id === a.paId)?.email ??
        'Inactive PA',
    })),
  }
}
// Validate twice: during staging for review and again in the apply transaction.
export async function proposeChange(
  tx: Prisma.TransactionClient,
  snapshot: ScheduleSnapshot,
  data: ChangeRequest
) {
  const current = snapshot.workshops.find((w) => w.id === data.id)
  if (!current || !['DRAFT', 'PUBLISHED'].includes(current.status))
    throw new SchedulingError('Only draft or published workshops can be changed.')
  if (current.version !== data.version)
    throw new SchedulingError('This workshop changed. Reload and review a new change.')
  const next: ScheduledWorkshop = {
    ...current,
    assignments: current.assignments.map((a) => ({ ...a })),
    locked: true,
  }
  if (data.kind === 'CANCEL') next.status = 'CANCELLED'
  if (data.kind === 'COMPLETE') {
    if (current.status !== 'PUBLISHED' || current.scheduledEnd.getTime() > Date.now())
      throw new SchedulingError('Only a published workshop that has ended can be completed.')
    next.status = 'COMPLETED'
  }
  if (data.kind === 'REPLACE') {
    if (
      data.oldPaId === data.newPaId ||
      !current.assignments.some((a) => a.paId === data.oldPaId) ||
      current.assignments.some((a) => a.paId === data.newPaId)
    )
      throw new SchedulingError('Choose an assigned PA and a different replacement.')
    next.assignments = next.assignments.filter((a) => a.paId !== data.oldPaId)
    next.assignments.push({
      paId: data.newPaId,
      status: current.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
      source: 'MANUAL',
    })
  }
  if (data.kind === 'RESCHEDULE') {
    const slot = workshopSchema.safeParse({
      ...data,
      classSectionId: current.classSectionId,
      minPAs: current.minPAs,
      maxPAs: current.maxPAs,
    })
    if (!slot.success) throw new SchedulingError(slot.error.issues[0].message)
    Object.assign(next, await validateSlot(tx, slot.data, current.id), { hostingValid: true })
  }
  const final = {
    ...snapshot,
    workshops: snapshot.workshops.map((w) => (w.id === next.id ? next : w)),
  }
  if (data.kind === 'REPLACE' || data.kind === 'RESCHEDULE') {
    // Replacement checks the new PA; an unrelated existing issue remains flagged.
    // Rescheduling must revalidate every retained PA in the destination month.
    const checked = data.kind === 'REPLACE' ? [data.newPaId] : next.assignments.map((a) => a.paId)
    for (const paId of checked) {
      const reasons = eligibility(final, next, paId)
      if (reasons.length) throw new SchedulingError(reasons.join(' '))
    }
  }
  return { current, next, final }
}
