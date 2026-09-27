import type { Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'
import { loadSchedule, SchedulingError } from './store'
import { staffingProblems, type ManualAssignmentInput } from './eligibility'
import { scheduleHash } from './matching-preview'
import { auditState } from './changes'
import { applyDraftTeamEdit } from './draft-operations'

export async function changeDraftStaffing(
  tx: Prisma.TransactionClient,
  actor: { id: string; name: string | null; email: string },
  input: { id: string; version: number; paId: string } & Partial<ManualAssignmentInput>,
  operation: 'assign' | 'remove'
) {
  const session = await tx.workshopSession.findUnique({
    where: { id: input.id },
    include: { classWorkshop: true },
  })
  if (!session) throw new SchedulingError('Select a draft workshop.')
  return applyDraftTeamEdit(tx, actor, {
    workshopDefinitionId: session.classWorkshop.workshopDefinitionId,
    sessionId: input.id,
    version: input.version,
    paId: input.paId,
    operation,
    expectedPolicyHash: input.expectedPolicyHash,
    requestKey: `direct:${actor.id}:${input.id}:${input.version}:${operation}:${input.paId}`,
  })
}

export async function publishDrafts(
  tx: Prisma.TransactionClient,
  actor: { id: string; name: string | null; email: string },
  entries: { id: string; version: number }[],
  expectedHash?: string,
  scope?: { month: string; classSectionIds?: string[] } | { workshopDefinitionId: string },
  requestKey?: string
) {
  const payloadHash = createHash('sha256')
    .update(JSON.stringify({ entries, expectedHash, scope }))
    .digest('hex')
  if (requestKey) {
    const receipt = await tx.publicationReceipt.findUnique({ where: { requestKey } })
    if (receipt) {
      if (receipt.actorId !== actor.id || receipt.payloadHash !== payloadHash)
        throw new SchedulingError('This publication request changed. Review the sessions again.')
      return
    }
  }
  const snapshot = await loadSchedule(
    tx,
    scope
      ? 'workshopDefinitionId' in scope
        ? { kind: 'run', workshopDefinitionId: scope.workshopDefinitionId }
        : { kind: 'month', month: scope.month, classSectionIds: scope.classSectionIds }
      : expectedHash
        ? undefined
        : { kind: 'sessions', workshopSessionIds: entries.map((entry) => entry.id) }
  )
  if (expectedHash && scheduleHash(snapshot) !== expectedHash)
    throw new SchedulingError(
      'Schedule or eligibility changed. Close this review, reload the schedule and review again.'
    )
  const workshops = entries.map((entry) => {
    const workshop = snapshot.workshops.find((w) => w.id === entry.id)
    if (!workshop || workshop.status !== 'DRAFT')
      throw new SchedulingError('Only drafts can be published.')
    if (
      scope &&
      'workshopDefinitionId' in scope &&
      workshop.workshopDefinitionId !== scope.workshopDefinitionId
    )
      throw new SchedulingError(
        'A selected teacher session is outside this workshop. Reload the schedule.'
      )
    if (workshop.version !== entry.version)
      throw new SchedulingError('This workshop changed. Reload and try again.')
    const problems = staffingProblems(snapshot, workshop)
    if (problems.length) throw new SchedulingError(problems.join(' '))
    return workshop
  })
  // Validate every selected workshop before the first write; the surrounding transaction is atomic.
  for (const workshop of workshops) {
    await tx.assignment.updateMany({
      where: { workshopSessionId: workshop.id },
      data: { status: 'PUBLISHED' },
    })
    await tx.workshopSession.update({
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
        workshopSessionId: workshop.id,
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
  if (requestKey)
    await tx.publicationReceipt.create({
      data: {
        requestKey,
        actorId: actor.id,
        payloadHash,
        sessionIds: entries.map((entry) => entry.id),
      },
    })
}
