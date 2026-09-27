import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  draftOperationChangesSchema,
  type DraftOperationChanges,
  type DraftTeamEdit,
  type AutoFillDraftInput,
  type UndoDraftInput,
} from '@/lib/schemas/draft-workspace'
import { loadSchedule, scheduleTransaction, SchedulingError } from './store'
import {
  assessAssignment,
  assignmentPolicyHash,
  eligibility,
  manualAssignmentDecision,
  type ScheduleSnapshot,
} from './eligibility'
import { scheduleHash } from './matching-preview'
import { autoFillMissingPAs } from './auto-fill'
import { auditState } from './changes'

type Actor = { id: string; name: string | null; email: string }
type TeamState = DraftOperationChanges[number]['before']
export type DraftCommandResult = { operationId?: string; message?: string; error?: string }
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

async function receipt(
  tx: Prisma.TransactionClient,
  actor: Actor,
  requestKey: string,
  payloadHash: string
) {
  if (await tx.draftStaffingOperation.findUnique({ where: { undoRequestKey: requestKey } }))
    throw new SchedulingError('This save key was already used for Undo. Use a new change request.')
  const operation = await tx.draftStaffingOperation.findUnique({ where: { requestKey } })
  if (!operation) return null
  if (operation.actorId !== actor.id || operation.payloadHash !== payloadHash)
    throw new SchedulingError(
      'This save key was used for a different change. Reload and try again.'
    )
  return {
    operationId: operation.id,
    message: operation.undoneAt ? 'This change was already undone.' : operation.summary,
  }
}

function rememberPolicies(
  state: TeamState,
  snapshot: ScheduleSnapshot,
  sessionId: string
): TeamState {
  const session = snapshot.workshops.find((item) => item.id === sessionId)!
  return {
    ...state,
    policyHashes: Object.fromEntries(
      state.assignments.map((item) => [
        item.paId,
        assignmentPolicyHash(session, item.paId, assessAssignment(snapshot, session, item.paId)),
      ])
    ),
  }
}

async function teamState(tx: Prisma.TransactionClient, sessionId: string): Promise<TeamState> {
  const row = await tx.workshopSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      assignments: { orderBy: { id: 'asc' } },
      autoFillExclusions: { orderBy: { paId: 'asc' } },
    },
  })
  return {
    version: row.version,
    locked: row.locked,
    assignments: row.assignments.map(
      ({
        id,
        paId,
        status,
        source,
        overrideAvailability,
        overrideSameDay,
        overrideWeek,
        overrideReason,
        assignedAt,
      }) => ({
        id,
        paId,
        status,
        source,
        overrideAvailability,
        overrideSameDay,
        overrideWeek,
        overrideReason,
        assignedAt: assignedAt.toISOString(),
      })
    ),
    excludedPaIds: row.autoFillExclusions.map((item) => item.paId),
  }
}

async function recordOperation(
  tx: Prisma.TransactionClient,
  actor: Actor,
  input: { workshopDefinitionId: string; requestKey: string },
  payloadHash: string,
  kind: string,
  summary: string,
  before: Map<string, TeamState>
): Promise<DraftCommandResult> {
  const changes: DraftOperationChanges = []
  const auditSnapshot = before.size
    ? await loadSchedule(tx, { kind: 'sessions', workshopSessionIds: [...before.keys()] })
    : null
  for (const [sessionId, state] of before) {
    await tx.workshopSession.update({
      where: { id: sessionId },
      data: { version: { increment: 1 } },
    })
    const after = await teamState(tx, sessionId)
    changes.push({ sessionId, before: state, after })
    const auditSession = auditSnapshot!.workshops.find((item) => item.id === sessionId)!
    await tx.workshopEvent.create({
      data: {
        workshopSessionId: sessionId,
        actorId: actor.id,
        actorName: actor.name ?? actor.email,
        kind: `DRAFT_${kind}`,
        reason: summary,
        before: auditState({ ...auditSession, assignments: state.assignments }, auditSnapshot!),
        after: auditState({ ...auditSession, assignments: after.assignments }, auditSnapshot!),
        wasPublished: false,
        affectedPAIds: [
          ...new Set([...state.assignments, ...after.assignments].map((item) => item.paId)),
        ],
      },
    })
  }
  const operation = await tx.draftStaffingOperation.create({
    data: {
      ...input,
      actorId: actor.id,
      payloadHash,
      kind,
      summary,
      changes,
    },
  })
  return { operationId: operation.id, message: summary }
}

export async function applyDraftTeamEdit(
  tx: Prisma.TransactionClient,
  actor: Actor,
  input: DraftTeamEdit
): Promise<DraftCommandResult> {
  const payloadHash = hash(input)
  const saved = await receipt(tx, actor, input.requestKey, payloadHash)
  if (saved) return saved
  const snapshot = await loadSchedule(tx, {
    kind: 'sessions',
    workshopSessionIds: [input.sessionId],
  })
  const session = snapshot.workshops.find((item) => item.id === input.sessionId)
  if (
    !session ||
    session.workshopDefinitionId !== input.workshopDefinitionId ||
    session.status !== 'DRAFT'
  )
    throw new SchedulingError('Select a private draft in this workshop.')
  if (session.version !== input.version)
    throw new SchedulingError(
      'This session changed. Its latest draft is saved; refresh the row and try again.'
    )
  const before = rememberPolicies(await teamState(tx, session.id), snapshot, session.id)
  const paId = input.paId
  const existing = before.assignments.find((item) => item.paId === paId)
  let summary: string
  switch (input.operation) {
    case 'assign':
    case 'keep': {
      if (!paId) throw new SchedulingError('Select a PA.')
      if (input.operation === 'assign' && existing)
        throw new SchedulingError('This PA is already assigned.')
      if (input.operation === 'keep' && !existing)
        throw new SchedulingError('This PA is no longer assigned.')
      const decision = manualAssignmentDecision(snapshot, session, paId, {
        expectedPolicyHash: input.expectedPolicyHash ?? '',
      })
      if (!decision.ok) throw new SchedulingError(decision.reasons.join(' '))
      const metadata = {
        overrideAvailability: decision.overrideAvailability,
        overrideSameDay: decision.overrideSameDay,
        overrideWeek: decision.overrideWeek,
        overrideReason: existing?.overrideReason ?? decision.overrideReason,
      }
      if (existing) await tx.assignment.update({ where: { id: existing.id }, data: metadata })
      else
        await tx.assignment.create({
          data: {
            workshopSessionId: session.id,
            paId,
            status: 'DRAFT',
            source: 'MANUAL',
            ...metadata,
          },
        })
      await tx.autoFillExclusion.deleteMany({ where: { workshopSessionId: session.id, paId } })
      summary =
        input.operation === 'keep'
          ? 'PA kept after reviewing current warnings. Saved to draft.'
          : 'PA added. Saved to draft.'
      break
    }
    case 'remove': {
      if (!existing || !paId) throw new SchedulingError('This PA is no longer assigned.')
      await tx.assignment.delete({ where: { id: existing.id } })
      await tx.autoFillExclusion.upsert({
        where: { workshopSessionId_paId: { workshopSessionId: session.id, paId } },
        update: {},
        create: { workshopSessionId: session.id, paId },
      })
      summary = 'PA removed. Auto-fill will not add this PA back to this session.'
      break
    }
    case 'lock':
    case 'unlock': {
      const locked = input.operation === 'lock'
      if (before.locked === locked)
        return recordOperation(
          tx,
          actor,
          { workshopDefinitionId: input.workshopDefinitionId, requestKey: input.requestKey },
          payloadHash,
          input.operation.toUpperCase(),
          locked ? 'Auto-fill is already off.' : 'Auto-fill is already allowed.',
          new Map()
        )
      await tx.workshopSession.update({ where: { id: session.id }, data: { locked } })
      summary = locked
        ? 'Session excluded from auto-fill. Existing team kept.'
        : 'Auto-fill allowed. Existing team kept.'
      break
    }
    case 'allow-pa': {
      if (!paId) throw new SchedulingError('Select a PA.')
      await tx.autoFillExclusion.deleteMany({ where: { workshopSessionId: session.id, paId } })
      summary = 'PA may be included in future auto-fill for this session.'
      break
    }
  }
  return recordOperation(
    tx,
    actor,
    { workshopDefinitionId: input.workshopDefinitionId, requestKey: input.requestKey },
    payloadHash,
    input.operation.toUpperCase(),
    summary,
    new Map([[session.id, before]])
  )
}

async function fillState(tx: Prisma.TransactionClient, input: AutoFillDraftInput) {
  const snapshot = await loadSchedule(tx, {
    kind: 'run',
    workshopDefinitionId: input.workshopDefinitionId,
  })
  for (const entry of input.entries) {
    const session = snapshot.workshops.find((item) => item.id === entry.id)
    if (
      !session ||
      session.workshopDefinitionId !== input.workshopDefinitionId ||
      session.status !== 'DRAFT'
    )
      throw new SchedulingError('Auto-fill only accepts selected private drafts in this workshop.')
    if (session.version !== entry.version)
      throw new SchedulingError(
        'A selected session changed. Refresh its saved draft before auto-fill.'
      )
  }
  const exclusions = await tx.autoFillExclusion.findMany({
    where: { workshopSessionId: { in: input.entries.map((entry) => entry.id) } },
    orderBy: [{ workshopSessionId: 'asc' }, { paId: 'asc' }],
  })
  const excluded: Record<string, string[]> = {}
  for (const item of exclusions) (excluded[item.workshopSessionId] ??= []).push(item.paId)
  return { snapshot, excluded, fingerprint: hash([scheduleHash(snapshot), excluded]) }
}

export async function fillDraftTeams(
  actor: Actor,
  input: AutoFillDraftInput
): Promise<DraftCommandResult> {
  const payloadHash = hash(input)
  // The graph is built and solved outside the scheduling write lock.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const resolved = await prisma.$transaction(
      async (tx) => {
        const saved = await receipt(tx, actor, input.requestKey, payloadHash)
        return saved ? { saved } : { state: await fillState(tx, input) }
      },
      { isolationLevel: 'RepeatableRead' }
    )
    if (resolved.saved) return resolved.saved
    const state = resolved.state!
    const result = autoFillMissingPAs(
      state.snapshot,
      input.entries.map((entry) => entry.id),
      state.excluded
    )
    const applied = await scheduleTransaction(async (tx): Promise<DraftCommandResult | null> => {
      const saved = await receipt(tx, actor, input.requestKey, payloadHash)
      if (saved) return saved
      const current = await fillState(tx, input)
      if (current.fingerprint !== state.fingerprint) return null
      const before = new Map<string, TeamState>()
      for (const addition of result.additions) {
        const session = current.snapshot.workshops.find(
          (item) => item.id === addition.workshopSessionId
        )
        if (
          !session ||
          session.status !== 'DRAFT' ||
          session.locked ||
          session.workshopDefinitionId !== input.workshopDefinitionId ||
          !input.entries.some((entry) => entry.id === session.id) ||
          session.assignments.length >= session.minPAs ||
          session.assignments.some((item) => item.paId === addition.paId) ||
          current.excluded[session.id]?.includes(addition.paId) ||
          !assessAssignment(current.snapshot, session, addition.paId).automaticEligible
        )
          throw new SchedulingError(
            'Auto-fill changed during validation. No assignments were saved; try again.'
          )
        if (!before.has(session.id))
          before.set(
            session.id,
            rememberPolicies(await teamState(tx, session.id), current.snapshot, session.id)
          )
        await tx.assignment.create({
          data: {
            workshopSessionId: session.id,
            paId: addition.paId,
            source: 'AUTOMATIC',
            status: 'DRAFT',
          },
        })
        session.assignments.push({ paId: addition.paId, source: 'AUTOMATIC', status: 'DRAFT' })
      }
      const remaining = input.entries.filter(({ id }) => {
        const session = current.snapshot.workshops.find((item) => item.id === id)!
        return session.assignments.length < session.minPAs
      }).length
      const summary = result.additions.length
        ? `Added ${result.additions.length} PA assignment${result.additions.length === 1 ? '' : 's'} to draft. ${remaining ? `${remaining} session${remaining === 1 ? '' : 's'} still need staffing.` : 'All selected minimums are met.'}`
        : remaining
          ? `No PAs added. ${result.excludedSessionIds.length ? `${result.excludedSessionIds.length} session(s) have auto-fill off. ` : ''}Could not fill the remaining gaps while keeping existing teams and automatic rules.`
          : 'No PAs added. Selected sessions already meet minimum staffing.'
      return recordOperation(
        tx,
        actor,
        { workshopDefinitionId: input.workshopDefinitionId, requestKey: input.requestKey },
        payloadHash,
        'AUTO_FILL',
        summary,
        before
      )
    })
    if (applied) return applied
  }
  throw new SchedulingError(
    'Availability or commitments are changing. Your saved draft is intact; retry auto-fill.'
  )
}

export async function undoDraftOperation(
  tx: Prisma.TransactionClient,
  actor: Actor,
  input: UndoDraftInput
): Promise<DraftCommandResult> {
  if (await tx.draftStaffingOperation.findUnique({ where: { requestKey: input.requestKey } }))
    throw new SchedulingError('This Undo key was used for another change. Use a new Undo request.')
  const operation = await tx.draftStaffingOperation.findUnique({ where: { id: input.operationId } })
  if (
    !operation ||
    operation.actorId !== actor.id ||
    operation.workshopDefinitionId !== input.workshopDefinitionId
  )
    throw new SchedulingError('This draft change is unavailable for Undo.')
  const usedKey = await tx.draftStaffingOperation.findUnique({
    where: { undoRequestKey: input.requestKey },
  })
  if (usedKey && usedKey.id !== operation.id)
    throw new SchedulingError('This Undo key was already used for another change.')
  if (operation.undoneAt) return { message: 'This change was already undone.' }
  const parsed = draftOperationChangesSchema.safeParse(operation.changes)
  if (!parsed.success)
    throw new SchedulingError(
      'This old change cannot be undone automatically. Edit the current draft instead.'
    )
  const changes = parsed.data
  if (!changes.length) {
    await tx.draftStaffingOperation.update({
      where: { id: operation.id },
      data: { undoneAt: new Date(), undoRequestKey: input.requestKey, undoActorId: actor.id },
    })
    return { message: 'There were no assignment changes to undo.' }
  }
  const snapshot = await loadSchedule(tx, {
    kind: 'sessions',
    workshopSessionIds: changes.map((item) => item.sessionId),
  })
  for (const change of changes) {
    const session = snapshot.workshops.find((item) => item.id === change.sessionId)
    if (
      !session ||
      session.status !== 'DRAFT' ||
      session.workshopDefinitionId !== input.workshopDefinitionId ||
      hash(await teamState(tx, session.id)) !== hash(change.after)
    )
      throw new SchedulingError(
        'An affected session changed or was published. Undo cannot overwrite newer work; edit its current team instead.'
      )
    session.assignments = change.before.assignments.map((item) => ({ ...item }))
  }
  // Validate every restored PA against the whole final schedule, including new external commitments.
  for (const change of changes) {
    const session = snapshot.workshops.find((item) => item.id === change.sessionId)!
    for (const assignment of change.before.assignments) {
      const after = change.after.assignments.find((item) => item.id === assignment.id)
      const restoringException =
        !!after &&
        ((assignment.overrideAvailability && !after.overrideAvailability) ||
          (assignment.overrideSameDay && !after.overrideSameDay) ||
          (assignment.overrideWeek && !after.overrideWeek))
      if (after && !restoringException) continue
      const currentPolicyHash = assignmentPolicyHash(
        session,
        assignment.paId,
        assessAssignment(snapshot, session, assignment.paId)
      )
      if (
        !change.before.policyHashes?.[assignment.paId] ||
        change.before.policyHashes[assignment.paId] !== currentPolicyHash
      )
        throw new SchedulingError(
          'Cannot restore this PA because availability or commitments changed. Review the current warning and assign manually.'
        )
      const errors = eligibility(snapshot, session, assignment.paId)
      if (errors.length)
        throw new SchedulingError(
          `Cannot restore this PA: ${errors.join(' ')} Review the current warning and assign manually.`
        )
    }
  }
  for (const change of changes) {
    const beforeIds = new Set(change.before.assignments.map((item) => item.id))
    const afterIds = new Set(change.after.assignments.map((item) => item.id))
    await tx.assignment.deleteMany({
      where: {
        id: {
          in: change.after.assignments
            .filter((item) => !beforeIds.has(item.id))
            .map((item) => item.id),
        },
        workshopSessionId: change.sessionId,
      },
    })
    for (const item of change.before.assignments) {
      const { id, assignedAt, ...data } = item
      if (!afterIds.has(id))
        await tx.assignment.create({
          data: { ...data, workshopSessionId: change.sessionId, assignedAt: new Date(assignedAt) },
        })
      else if (hash(item) !== hash(change.after.assignments.find((other) => other.id === id)))
        await tx.assignment.update({
          where: { id },
          data: { ...data, assignedAt: new Date(assignedAt) },
        })
    }
    await tx.autoFillExclusion.deleteMany({
      where: { workshopSessionId: change.sessionId, paId: { notIn: change.before.excludedPaIds } },
    })
    for (const paId of change.before.excludedPaIds)
      await tx.autoFillExclusion.upsert({
        where: { workshopSessionId_paId: { workshopSessionId: change.sessionId, paId } },
        update: {},
        create: { workshopSessionId: change.sessionId, paId },
      })
    await tx.workshopSession.update({
      where: { id: change.sessionId },
      data: { locked: change.before.locked, version: { increment: 1 } },
    })
    await tx.workshopEvent.create({
      data: {
        workshopSessionId: change.sessionId,
        actorId: actor.id,
        actorName: actor.name ?? actor.email,
        kind: 'DRAFT_UNDO',
        reason: `Undid: ${operation.summary}`,
        before: auditState(
          {
            ...snapshot.workshops.find((item) => item.id === change.sessionId)!,
            assignments: change.after.assignments,
          },
          snapshot
        ),
        after: auditState(
          {
            ...snapshot.workshops.find((item) => item.id === change.sessionId)!,
            assignments: change.before.assignments,
          },
          snapshot
        ),
        wasPublished: false,
        affectedPAIds: [
          ...new Set(
            [...change.before.assignments, ...change.after.assignments].map((item) => item.paId)
          ),
        ],
      },
    })
  }
  await tx.draftStaffingOperation.update({
    where: { id: operation.id },
    data: { undoneAt: new Date(), undoRequestKey: input.requestKey, undoActorId: actor.id },
  })
  return { message: 'Change undone. Saved to draft.' }
}
