import type { Prisma } from '@prisma/client'
import { loadSchedule, SchedulingError } from './store'
import { eligibility, staffingProblems } from './eligibility'
import { scheduleHash } from './matching-preview'
import { auditState } from './changes'

export async function changeDraftStaffing(
  tx: Prisma.TransactionClient,
  input: { id: string; version: number; paId: string },
  operation: 'assign' | 'remove'
) {
  const snapshot = await loadSchedule(tx)
  const workshop = snapshot.workshops.find((w) => w.id === input.id)
  if (!workshop || workshop.status !== 'DRAFT')
    throw new SchedulingError('Select a draft workshop.')
  if (workshop.version !== input.version)
    throw new SchedulingError('This workshop changed. Reload and try again.')
  if (operation === 'assign') {
    if (workshop.assignments.some((a) => a.paId === input.paId))
      throw new SchedulingError('This PA is already assigned.')
    const reasons = eligibility(snapshot, workshop, input.paId)
    if (reasons.length) throw new SchedulingError(reasons.join(' '))
    await tx.assignment.create({
      data: { workshopId: input.id, paId: input.paId, status: 'DRAFT', source: 'MANUAL' },
    })
  } else {
    await tx.assignment.deleteMany({ where: { workshopId: input.id, paId: input.paId } })
  }
  await tx.workshop.update({
    where: { id: input.id },
    data: { locked: true, version: { increment: 1 } },
  })
}

export async function publishDrafts(
  tx: Prisma.TransactionClient,
  actor: { id: string; name: string | null; email: string },
  entries: { id: string; version: number }[],
  expectedHash?: string
) {
  const snapshot = await loadSchedule(tx)
  if (expectedHash && scheduleHash(snapshot) !== expectedHash)
    throw new SchedulingError(
      'Schedule or eligibility changed. Close this review, reload the schedule and review again.'
    )
  const workshops = entries.map((entry) => {
    const workshop = snapshot.workshops.find((w) => w.id === entry.id)
    if (!workshop || workshop.status !== 'DRAFT')
      throw new SchedulingError('Only drafts can be published.')
    if (workshop.version !== entry.version)
      throw new SchedulingError('This workshop changed. Reload and try again.')
    const problems = staffingProblems(snapshot, workshop)
    if (problems.length) throw new SchedulingError(problems.join(' '))
    return workshop
  })
  // Validate every selected workshop before the first write; the surrounding transaction is atomic.
  for (const workshop of workshops) {
    await tx.assignment.updateMany({
      where: { workshopId: workshop.id },
      data: { status: 'PUBLISHED' },
    })
    await tx.workshop.update({
      where: { id: workshop.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        locked: true,
        version: { increment: 1 },
      },
    })
    await tx.workshopEvent.create({
      data: {
        workshopId: workshop.id,
        actorId: actor.id,
        actorName: actor.name ?? actor.email,
        kind: 'PUBLISH',
        reason: 'Workshop published.',
        before: auditState(workshop, snapshot),
        after: auditState({ ...workshop, status: 'PUBLISHED' }, snapshot),
        wasPublished: true,
        affectedPAIds: workshop.assignments.map((a) => a.paId),
      },
    })
  }
}
