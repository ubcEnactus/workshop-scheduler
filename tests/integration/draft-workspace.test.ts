import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../src/lib/db'
import { form, resetFixtures } from '../fixtures'
import { vancouverToUtc } from '../../src/lib/time'
import * as store from '../../src/lib/scheduling/store'
import * as solver from '../../src/lib/scheduling/auto-fill'
import {
  assessAssignment,
  assignmentPolicyHash,
  staffingProblems,
} from '../../src/lib/scheduling/eligibility'
import { scheduleHash } from '../../src/lib/scheduling/matching-preview'
import { visibleWorkshop } from '../../src/lib/scheduling/visibility'
import { auditStateSchema } from '../../src/lib/schemas/changes'
import {
  draftOperationChangesSchema,
  type DraftTeamEdit,
} from '../../src/lib/schemas/draft-workspace'

const { sessionAuth } = vi.hoisted(() => ({ sessionAuth: vi.fn() }))
vi.mock('next-auth', () => ({ default: () => ({ auth: sessionAuth }) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error('REDIRECT:' + url)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
import {
  editDraftTeam,
  autoFillDraftTeam,
  undoDraftTeam,
} from '../../src/app/admin/workshop-definitions/[id]/staffing-actions'
import { publishSelectedDrafts } from '../../src/app/admin/workshops/workspace-actions'
import { publishWorkshop } from '../../src/app/admin/staffing/actions'

let f: Awaited<ReturnType<typeof resetFixtures>>
const definitionId = 'fixture-definition-1'
beforeEach(async () => {
  f = await resetFixtures()
  sessionAuth.mockResolvedValue({ user: { id: f.admin.id } })
})
afterEach(() => vi.restoreAllMocks())
afterAll(() => prisma.$disconnect())

async function coverage(paId = f.pa.id) {
  await prisma.availability.createMany({
    data: [0, 1, 2, 3, 4].flatMap((dayOfWeek) =>
      Array.from({ length: 24 }, (_, i) => ({ userId: paId, dayOfWeek, startMin: 540 + i * 15 }))
    ),
  })
}
async function anotherPA() {
  const pa = await prisma.user.create({
    data: { email: `${randomUUID()}@fixture.local`, role: 'PA', name: 'Another PA' },
  })
  await coverage(pa.id)
  return pa
}
async function draft(
  options: {
    definitionId?: string
    date?: string
    start?: number
    minPAs?: number
    maxPAs?: number
    locked?: boolean
  } = {}
) {
  const teacher = await prisma.user.create({
    data: { email: `${randomUUID()}@fixture.local`, role: 'TEACHER', schoolId: f.school.id },
  })
  const cls = await prisma.classSection.create({
    data: { name: 'Draft fixture class', teacherId: teacher.id, schoolId: f.school.id },
  })
  const start = vancouverToUtc(options.date ?? '2027-01-04', options.start ?? 600)
  const end = new Date(start.getTime() + 60 * 60_000)
  const cw = await prisma.classWorkshop.create({
    data: {
      classSectionId: cls.id,
      workshopDefinitionId: options.definitionId ?? definitionId,
      availabilitySlots: { create: { start, end } },
    },
  })
  return prisma.workshopSession.create({
    data: {
      classWorkshopId: cw.id,
      scheduledStart: start,
      scheduledEnd: end,
      minPAs: options.minPAs ?? 1,
      maxPAs: options.maxPAs ?? 3,
      locked: options.locked ?? false,
    },
  })
}
async function editInput(
  sessionId: string,
  operation: DraftTeamEdit['operation'],
  paId?: string
): Promise<DraftTeamEdit> {
  const snapshot = await store.loadSchedule(prisma, {
    kind: 'sessions',
    workshopSessionIds: [sessionId],
  })
  const row = snapshot.workshops.find((item) => item.id === sessionId)!
  return {
    workshopDefinitionId: row.workshopDefinitionId!,
    sessionId,
    version: row.version,
    requestKey: randomUUID(),
    operation,
    ...(paId ? { paId } : {}),
    ...(['assign', 'keep'].includes(operation) && paId
      ? {
          expectedPolicyHash: assignmentPolicyHash(
            row,
            paId,
            assessAssignment(snapshot, row, paId)
          ),
        }
      : {}),
  }
}
async function fillInput(ids: string[], workshopDefinitionId = definitionId) {
  const rows = await prisma.workshopSession.findMany({
    where: { id: { in: ids } },
    orderBy: { id: 'asc' },
  })
  return {
    workshopDefinitionId,
    requestKey: randomUUID(),
    entries: rows.map(({ id, version }) => ({ id, version })),
  }
}
async function undo(operationId: string, requestKey: string = randomUUID()) {
  return undoDraftTeam({ workshopDefinitionId: definitionId, operationId, requestKey })
}
async function team(sessionId: string) {
  return prisma.workshopSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      assignments: { orderBy: { id: 'asc' } },
      autoFillExclusions: { orderBy: { paId: 'asc' } },
    },
  })
}

describe('persistent private draft workspace', () => {
  it.each([editDraftTeam, autoFillDraftTeam, undoDraftTeam])(
    'authorizes before parsing every command',
    async (action) => {
      for (const user of [f.pa, f.teacher]) {
        sessionAuth.mockResolvedValue({ user: { id: user.id } })
        await expect(action(null)).rejects.toThrow('/403')
      }
    }
  )

  it('validates input, exact membership and draft lifecycle before changing anything', async () => {
    const row = await draft()
    for (const action of [editDraftTeam, autoFillDraftTeam, undoDraftTeam])
      expect((await action({})).error).toBeTruthy()
    const input = await editInput(row.id, 'assign', f.pa.id)
    expect(
      (await editDraftTeam({ ...input, workshopDefinitionId: 'fixture-definition-2' })).error
    ).toContain('private draft')
    expect(
      (
        await autoFillDraftTeam({
          ...(await fillInput([row.id])),
          entries: [
            { id: row.id, version: 0 },
            { id: row.id, version: 0 },
          ],
        })
      ).error
    ).toContain('once')
    expect(
      (await autoFillDraftTeam(await fillInput([row.id], 'fixture-definition-2'))).error
    ).toContain('this workshop')
    await prisma.workshopSession.update({ where: { id: row.id }, data: { status: 'PUBLISHED' } })
    expect((await editDraftTeam(input)).error).toContain('private draft')
    expect((await autoFillDraftTeam(await fillInput([row.id]))).error).toContain('private drafts')
    expect(await prisma.assignment.count()).toBe(0)
    expect(await prisma.draftStaffingOperation.count()).toBe(0)
  })

  it.each(['missing', 'partial'])(
    'saves a %s-availability choice directly without locking, and retries exactly once',
    async (kind) => {
      const row = await draft()
      if (kind === 'partial')
        await prisma.availability.create({ data: { userId: f.pa.id, dayOfWeek: 0, startMin: 600 } })
      const input = await editInput(row.id, 'assign', f.pa.id)
      const [first, retry] = await Promise.all([editDraftTeam(input), editDraftTeam(input)])
      expect(first.error).toBeUndefined()
      expect(retry).toEqual(first)
      expect(first.operationId).toBeTruthy()
      const saved = await team(row.id)
      expect(saved).toMatchObject({ locked: false, version: 1, status: 'DRAFT' })
      expect(saved.assignments).toHaveLength(1)
      expect(saved.assignments[0]).toMatchObject({
        source: 'MANUAL',
        overrideAvailability: true,
        overrideReason: null,
      })
      expect(await prisma.workshopEvent.count()).toBe(1)
      expect(await prisma.draftStaffingOperation.count()).toBe(1)
      expect(await prisma.workshopSession.count({ where: visibleWorkshop })).toBe(0)
    }
  )

  it('rejects reuse of an operation key for a different actor or payload', async () => {
    const row = await draft()
    const input = await editInput(row.id, 'assign', f.pa.id)
    await editDraftTeam(input)
    expect((await editDraftTeam({ ...input, operation: 'remove', version: 1 })).error).toContain(
      'different change'
    )
    const other = await prisma.user.create({
      data: { role: 'ADMIN', email: 'other-admin@fixture.local' },
    })
    sessionAuth.mockResolvedValue({ user: { id: other.id } })
    expect((await editDraftTeam(input)).error).toContain('different change')
    expect(await prisma.assignment.count()).toBe(1)
    expect(await prisma.workshopEvent.count()).toBe(1)
  })

  it('reserves no-op keys and prevents save and Undo commands from sharing keys', async () => {
    const row = await draft()
    const noOpInput = await editInput(row.id, 'unlock')
    const noOp = await editDraftTeam(noOpInput)
    expect(noOp.operationId).toBeTruthy()
    expect(await editDraftTeam(noOpInput)).toEqual(noOp)
    expect((await editDraftTeam({ ...noOpInput, operation: 'lock' })).error).toContain(
      'different change'
    )
    expect((await undo(noOp.operationId!, noOpInput.requestKey)).error).toContain('another change')
    const undoKey = randomUUID()
    expect((await undo(noOp.operationId!, undoKey)).error).toBeUndefined()
    expect((await undo(noOp.operationId!, undoKey)).message).toContain('already undone')
    expect(
      (await editDraftTeam({ ...(await editInput(row.id, 'lock')), requestKey: undoKey })).error
    ).toContain('used for Undo')
    expect((await team(row.id)).version).toBe(0)
    expect((await team(row.id)).locked).toBe(false)
    expect(await prisma.workshopEvent.count()).toBe(0)
    expect(await prisma.draftStaffingOperation.count()).toBe(1)
  })

  it('limits Undo to its actor and workshop and binds each Undo key to one operation', async () => {
    const row = await draft()
    const added = await editDraftTeam(await editInput(row.id, 'assign', f.pa.id))
    expect(
      (
        await undoDraftTeam({
          workshopDefinitionId: 'fixture-definition-2',
          operationId: added.operationId!,
          requestKey: randomUUID(),
        })
      ).error
    ).toContain('unavailable')
    const other = await prisma.user.create({
      data: { role: 'ADMIN', email: 'undo-admin@fixture.local' },
    })
    sessionAuth.mockResolvedValue({ user: { id: other.id } })
    expect((await undo(added.operationId!)).error).toContain('unavailable')
    sessionAuth.mockResolvedValue({ user: { id: f.admin.id } })
    const undoKey = randomUUID()
    expect((await undo(added.operationId!, undoKey)).error).toBeUndefined()
    const next = await editDraftTeam(await editInput(row.id, 'assign', f.pa.id))
    expect((await undo(next.operationId!, undoKey)).error).toContain('another change')
    expect((await team(row.id)).assignments).toHaveLength(1)
  })

  it('retains saves across elapsed time and supports durable, idempotent Undo after reload', async () => {
    const row = await draft()
    const input = await editInput(row.id, 'assign', f.pa.id)
    const saved = await editDraftTeam(input)
    await prisma.draftStaffingOperation.update({
      where: { id: saved.operationId! },
      data: { createdAt: new Date(0) },
    })
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 48 * 60 * 60_000)
    expect(await editDraftTeam(input)).toEqual(saved)
    expect((await team(row.id)).assignments).toHaveLength(1)
    const requestKey = randomUUID()
    const [first, retry] = await Promise.all([
      undo(saved.operationId!, requestKey),
      undo(saved.operationId!, requestKey),
    ])
    expect(first.error).toBeUndefined()
    expect(retry.error).toBeUndefined()
    expect(await prisma.assignment.count()).toBe(0)
    expect(await prisma.workshopEvent.count({ where: { kind: 'DRAFT_UNDO' } })).toBe(1)
    expect((await team(row.id)).version).toBe(2)
    expect((await editDraftTeam(input)).message).toContain('already undone')
  })

  it('rejects stale versions and changed policy hashes without losing the saved draft', async () => {
    await coverage()
    const row = await draft()
    const stale = await editInput(row.id, 'assign', f.pa.id)
    await prisma.availability.deleteMany({ where: { userId: f.pa.id } })
    expect((await editDraftTeam(stale)).error).toContain('changed')
    expect(await prisma.assignment.count()).toBe(0)
    const saved = await editDraftTeam(await editInput(row.id, 'assign', f.pa.id))
    expect(saved.operationId).toBeTruthy()
    expect(
      (await editDraftTeam({ ...(await editInput(row.id, 'remove', f.pa.id)), version: 0 })).error
    ).toContain('changed')
    expect((await team(row.id)).assignments).toHaveLength(1)
  })

  it('keeps real overlap and inactive/capacity blocks despite direct warning-based assignment', async () => {
    const row = await draft({ maxPAs: 1 })
    const existing = await draft({ definitionId: 'fixture-definition-2', start: 630 })
    await prisma.assignment.create({ data: { workshopSessionId: existing.id, paId: f.pa.id } })
    expect((await editDraftTeam(await editInput(row.id, 'assign', f.pa.id))).error).toContain(
      'Conflicting assignment'
    )
    expect((await editDraftTeam(await editInput(row.id, 'assign', f.deleted.id))).error).toContain(
      'inactive'
    )
    const other = await anotherPA()
    await editDraftTeam(await editInput(row.id, 'assign', other.id))
    expect((await editDraftTeam(await editInput(row.id, 'assign', f.pa.id))).error).toContain(
      'capacity'
    )
    expect((await team(row.id)).assignments.map((item) => item.paId)).toEqual([other.id])
  })

  it('Keep PA reaffirms changed availability without replacing identity, provenance or history', async () => {
    await coverage()
    const row = await draft()
    const original = await prisma.assignment.create({
      data: { workshopSessionId: row.id, paId: f.pa.id, source: 'AUTOMATIC' },
    })
    await prisma.availability.deleteMany({ where: { userId: f.pa.id } })
    let snapshot = await store.loadSchedule(prisma)
    expect(
      staffingProblems(snapshot, snapshot.workshops.find((item) => item.id === row.id)!)
    ).not.toEqual([])
    const kept = await editDraftTeam(await editInput(row.id, 'keep', f.pa.id))
    expect(kept.error).toBeUndefined()
    expect((await team(row.id)).assignments[0]).toMatchObject({
      id: original.id,
      source: original.source,
      assignedAt: original.assignedAt,
      overrideAvailability: true,
    })
    snapshot = await store.loadSchedule(prisma)
    expect(
      staffingProblems(snapshot, snapshot.workshops.find((item) => item.id === row.id)!)
    ).toEqual([])
    expect((await undo(kept.operationId!)).error).toBeUndefined()
    expect((await team(row.id)).assignments[0]).toMatchObject({
      id: original.id,
      overrideAvailability: false,
    })
  })

  it('manual removal excludes only that session, while Add and Undo round-trip exclusions', async () => {
    await coverage()
    const row = await draft()
    await prisma.assignment.create({
      data: { workshopSessionId: row.id, paId: f.pa.id, source: 'AUTOMATIC' },
    })
    await editDraftTeam(await editInput(row.id, 'remove', f.pa.id))
    expect((await team(row.id)).autoFillExclusions.map((item) => item.paId)).toEqual([f.pa.id])
    expect((await autoFillDraftTeam(await fillInput([row.id]))).message).toContain('No PAs added')
    expect((await team(row.id)).version).toBe(1)
    const other = await draft({ date: '2027-01-11' })
    expect((await autoFillDraftTeam(await fillInput([other.id]))).message).toContain('Added 1')
    const added = await editDraftTeam(await editInput(row.id, 'assign', f.pa.id))
    expect((await team(row.id)).autoFillExclusions).toEqual([])
    expect((await undo(added.operationId!)).error).toBeUndefined()
    const restored = await team(row.id)
    expect(restored.assignments).toEqual([])
    expect(restored.autoFillExclusions.map((item) => item.paId)).toEqual([f.pa.id])
    await editDraftTeam(await editInput(row.id, 'allow-pa', f.pa.id))
    expect((await autoFillDraftTeam(await fillInput([row.id]))).message).toContain('Added 1')
  })

  it('Undo Remove restores metadata and exclusion state without affecting other assignments', async () => {
    const row = await draft()
    const other = await anotherPA()
    const retained = await prisma.assignment.create({
      data: { workshopSessionId: row.id, paId: other.id, source: 'AUTOMATIC' },
    })
    const original = await prisma.assignment.create({
      data: {
        workshopSessionId: row.id,
        paId: f.pa.id,
        overrideAvailability: true,
        overrideWeek: true,
        overrideReason: 'Historical review',
        assignedAt: new Date('2026-09-01'),
      },
    })
    const removed = await editDraftTeam(await editInput(row.id, 'remove', f.pa.id))
    expect((await undo(removed.operationId!)).error).toBeUndefined()
    expect(await prisma.assignment.findUniqueOrThrow({ where: { id: retained.id } })).toEqual(
      retained
    )
    const restored = await prisma.assignment.findFirstOrThrow({
      where: { workshopSessionId: row.id, paId: f.pa.id },
    })
    const { id: originalId, ...originalFields } = original
    expect(restored).toMatchObject(originalFields)
    expect(restored.id).not.toBe(originalId)
    expect((await team(row.id)).autoFillExclusions).toEqual([])
  })

  it.each(['overlap', 'new availability warning'])(
    'Undo Remove rechecks external %s without partial restoration',
    async (kind) => {
      await coverage()
      const row = await draft()
      await prisma.assignment.create({ data: { workshopSessionId: row.id, paId: f.pa.id } })
      const removed = await editDraftTeam(await editInput(row.id, 'remove', f.pa.id))
      if (kind === 'overlap') {
        const elsewhere = await draft({ definitionId: 'fixture-definition-2' })
        await prisma.assignment.create({ data: { workshopSessionId: elsewhere.id, paId: f.pa.id } })
      } else await prisma.availability.deleteMany({ where: { userId: f.pa.id } })
      const before = await team(row.id)
      expect((await undo(removed.operationId!)).error).toContain('Cannot restore this PA')
      expect(await team(row.id)).toEqual(before)
      expect(
        (
          await prisma.draftStaffingOperation.findUniqueOrThrow({
            where: { id: removed.operationId! },
          })
        ).undoneAt
      ).toBeNull()
      expect(await prisma.workshopEvent.count({ where: { kind: 'DRAFT_UNDO' } })).toBe(0)
    }
  )

  it('does not reuse a historical workload override to approve a new commitment during Undo Remove', async () => {
    await coverage()
    const row = await draft()
    const originalCommitment = await draft({
      definitionId: 'fixture-definition-2',
      date: '2027-01-05',
    })
    await prisma.assignment.create({
      data: { workshopSessionId: originalCommitment.id, paId: f.pa.id },
    })
    const added = await editDraftTeam(await editInput(row.id, 'assign', f.pa.id))
    expect(added.error).toBeUndefined()
    expect((await team(row.id)).assignments[0].overrideWeek).toBe(true)
    const removed = await editDraftTeam(await editInput(row.id, 'remove', f.pa.id))
    const newCommitment = await draft({ definitionId: 'fixture-definition-2', date: '2027-01-06' })
    await prisma.assignment.create({
      data: { workshopSessionId: newCommitment.id, paId: f.pa.id, overrideWeek: true },
    })
    const before = await team(row.id)
    expect((await undo(removed.operationId!)).error).toContain('commitments changed')
    expect(await team(row.id)).toEqual(before)
    expect(await prisma.workshopEvent.count({ where: { kind: 'DRAFT_UNDO' } })).toBe(0)
  })

  it('does not restore a former exception on the same assignment ID after policy changes', async () => {
    await coverage()
    const row = await draft()
    const original = await prisma.assignment.create({
      data: { workshopSessionId: row.id, paId: f.pa.id, overrideWeek: true },
    })
    const kept = await editDraftTeam(await editInput(row.id, 'keep', f.pa.id))
    expect((await team(row.id)).assignments[0]).toMatchObject({
      id: original.id,
      overrideWeek: false,
    })
    const newCommitment = await draft({ definitionId: 'fixture-definition-2', date: '2027-01-05' })
    await prisma.assignment.create({ data: { workshopSessionId: newCommitment.id, paId: f.pa.id } })
    expect((await undo(kept.operationId!)).error).toContain('commitments changed')
    expect((await team(row.id)).assignments[0]).toMatchObject({
      id: original.id,
      overrideWeek: false,
    })
  })

  it('preserves locked teams until Allow auto-fill and never assigns on that toggle itself', async () => {
    await coverage()
    await anotherPA()
    const row = await draft({ minPAs: 2, maxPAs: 4, locked: true })
    const pinned = await prisma.assignment.create({
      data: { workshopSessionId: row.id, paId: f.pa.id, overrideAvailability: true },
    })
    expect((await autoFillDraftTeam(await fillInput([row.id]))).message).toContain('auto-fill off')
    expect((await team(row.id)).version).toBe(0)
    const unlocked = await editDraftTeam(await editInput(row.id, 'unlock'))
    expect(unlocked.error).toBeUndefined()
    expect((await team(row.id)).assignments).toHaveLength(1)
    expect(await prisma.assignment.findUniqueOrThrow({ where: { id: pinned.id } })).toEqual(pinned)
    expect((await autoFillDraftTeam(await fillInput([row.id]))).message).toContain('Added 1')
    expect((await team(row.id)).assignments).toHaveLength(2)
  })

  it('fills minimums only across months and preserves all existing manual/automatic records and out-of-scope teams', async () => {
    await coverage()
    const other = await anotherPA()
    const first = await draft({ minPAs: 2, maxPAs: 4 })
    const second = await draft({ date: '2027-02-01', minPAs: 2, maxPAs: 4 })
    const outside = await draft({ definitionId: 'fixture-definition-2', date: '2027-03-01' })
    const pinned = await Promise.all([
      prisma.assignment.create({
        data: {
          workshopSessionId: first.id,
          paId: f.pa.id,
          overrideWeek: true,
          overrideReason: 'Existing exception',
        },
      }),
      prisma.assignment.create({
        data: { workshopSessionId: second.id, paId: other.id, source: 'AUTOMATIC' },
      }),
    ])
    const input = await fillInput([first.id, second.id])
    const [saved, retry] = await Promise.all([autoFillDraftTeam(input), autoFillDraftTeam(input)])
    expect(saved.message).toContain('Added 2')
    expect(retry).toEqual(saved)
    expect(await prisma.assignment.count()).toBe(4)
    for (const record of pinned)
      expect(await prisma.assignment.findUniqueOrThrow({ where: { id: record.id } })).toEqual(
        record
      )
    expect((await team(outside.id)).assignments).toEqual([])
    const versions = [(await team(first.id)).version, (await team(second.id)).version]
    expect((await autoFillDraftTeam(await fillInput([first.id, second.id]))).message).toContain(
      'already meet minimum'
    )
    expect([(await team(first.id)).version, (await team(second.id)).version]).toEqual(versions)
    expect(await prisma.assignment.count()).toBe(4)
    expect((await undo(saved.operationId!)).error).toBeUndefined()
    expect(await prisma.assignment.count()).toBe(2)
    for (const record of pinned)
      expect(await prisma.assignment.findUniqueOrThrow({ where: { id: record.id } })).toEqual(
        record
      )
    expect(await prisma.autoFillExclusion.count()).toBe(0)
  })

  it('saves valid partial auto-fill atomically without violating shared weekly capacity', async () => {
    await coverage()
    const first = await draft()
    const second = await draft({ date: '2027-01-05' })
    const result = await autoFillDraftTeam(await fillInput([first.id, second.id]))
    expect(result.message).toContain('Added 1')
    expect(result.message).toContain('1 session still need staffing')
    expect(await prisma.assignment.count()).toBe(1)
    const operation = await prisma.draftStaffingOperation.findUniqueOrThrow({
      where: { id: result.operationId! },
    })
    expect(draftOperationChangesSchema.parse(operation.changes)).toHaveLength(1)
  })

  it('serializes competing auto-fill requests for overlapping cross-run commitments', async () => {
    await coverage()
    const first = await draft()
    const second = await draft({ definitionId: 'fixture-definition-2' })
    const requests = await Promise.all([
      fillInput([first.id]),
      fillInput([second.id], 'fixture-definition-2'),
    ])
    const results = await Promise.all(requests.map((input) => autoFillDraftTeam(input)))
    expect(results.every((result) => !result.error)).toBe(true)
    expect(await prisma.assignment.count()).toBe(1)
    expect(await prisma.draftStaffingOperation.count()).toBe(2)
  })

  it('rolls back earlier additions when any later computed addition fails validation', async () => {
    await coverage()
    const first = await draft()
    const second = await draft({ date: '2027-01-11' })
    vi.spyOn(solver, 'autoFillMissingPAs').mockReturnValueOnce({
      additions: [
        { workshopSessionId: first.id, paId: f.pa.id },
        { workshopSessionId: second.id, paId: 'inactive-pa' },
      ],
      outcome: 'COMPLETE',
      remainingSessionIds: [],
      excludedSessionIds: [],
    })
    expect((await autoFillDraftTeam(await fillInput([first.id, second.id]))).error).toContain(
      'No assignments were saved'
    )
    expect(await prisma.assignment.count()).toBe(0)
    expect(await prisma.workshopEvent.count()).toBe(0)
    expect(await prisma.draftStaffingOperation.count()).toBe(0)
    expect((await team(first.id)).version).toBe(0)
  })

  it('recomputes once when availability changes after the solver snapshot', async () => {
    await coverage()
    const row = await draft()
    const original = store.loadSchedule
    let changed = false
    vi.spyOn(store, 'loadSchedule').mockImplementation(async (db, scope) => {
      const snapshot = await original(db, scope)
      if (!changed) {
        changed = true
        await prisma.availability.deleteMany({ where: { userId: f.pa.id } })
      }
      return snapshot
    })
    const result = await autoFillDraftTeam(await fillInput([row.id]))
    expect(result.error).toBeUndefined()
    expect(result.message).toContain('No PAs added')
    expect(await prisma.assignment.count()).toBe(0)
    expect(await prisma.draftStaffingOperation.count()).toBe(1)
  })

  it('stops after bounded retry when the snapshot keeps changing, retaining the draft', async () => {
    await coverage()
    const row = await draft()
    const original = store.loadSchedule
    let loads = 0
    vi.spyOn(store, 'loadSchedule').mockImplementation(async (db, scope) => {
      const snapshot = await original(db, scope)
      loads += 1
      if (loads % 2 === 1)
        await prisma.user.update({ where: { id: f.pa.id }, data: { name: `Changed ${loads}` } })
      return snapshot
    })
    const result = await autoFillDraftTeam(await fillInput([row.id]))
    expect(result.error).toContain('retry auto-fill')
    expect(loads).toBe(4)
    expect(await prisma.assignment.count()).toBe(0)
    expect(await prisma.draftStaffingOperation.count()).toBe(0)
  })

  it.each(['edited', 'published'])(
    'rejects entire multi-session Undo after one affected session is %s',
    async (kind) => {
      await coverage()
      const first = await draft()
      const second = await draft({ date: '2027-01-11' })
      const filled = await autoFillDraftTeam(await fillInput([first.id, second.id]))
      if (kind === 'edited') {
        const pa = await anotherPA()
        await editDraftTeam(await editInput(second.id, 'assign', pa.id))
      } else
        await expect(publishWorkshop(form({ id: second.id, version: 1 }))).rejects.toThrow(
          'published=1'
        )
      const before = await prisma.assignment.findMany({ orderBy: { id: 'asc' } })
      expect((await undo(filled.operationId!)).error).toContain('cannot overwrite newer work')
      expect(await prisma.assignment.findMany({ orderBy: { id: 'asc' } })).toEqual(before)
      expect(await prisma.workshopEvent.count({ where: { kind: 'DRAFT_UNDO' } })).toBe(0)
    }
  )

  it('keeps publication separate, scoped, fresh and atomic', async () => {
    await coverage()
    const first = await draft()
    const second = await draft({ date: '2027-01-11' })
    await autoFillDraftTeam(await fillInput([first.id, second.id]))
    expect(await prisma.workshopSession.count({ where: visibleWorkshop })).toBe(0)
    const scope = { workshopDefinitionId: definitionId }
    const snapshot = await store.loadSchedule(prisma, { kind: 'run', ...scope })
    const entries = snapshot.workshops.map(({ id, version }) => ({ id, version }))
    const other = await anotherPA()
    await editDraftTeam(await editInput(second.id, 'assign', other.id))
    expect(
      (await publishSelectedDrafts({ scope, entries, inputHash: scheduleHash(snapshot) })).error
    ).toContain('changed')
    expect(await prisma.workshopSession.count({ where: visibleWorkshop })).toBe(0)
    const fresh = await store.loadSchedule(prisma, { kind: 'run', ...scope })
    expect(
      (
        await publishSelectedDrafts({
          scope,
          entries: [{ id: first.id, version: 1 }],
          inputHash: scheduleHash(fresh),
        })
      ).success
    ).toContain('1 teacher session published')
    expect((await team(first.id)).status).toBe('PUBLISHED')
    expect((await team(second.id)).status).toBe('DRAFT')
    expect(await prisma.workshopSession.count({ where: visibleWorkshop })).toBe(1)
  })

  it('keeps every operation and Undo event compatible with session history rendering', async () => {
    await coverage()
    const row = await draft()
    const added = await editDraftTeam(await editInput(row.id, 'assign', f.pa.id))
    await undo(added.operationId!)
    await autoFillDraftTeam(await fillInput([row.id]))
    const removed = await editDraftTeam(await editInput(row.id, 'remove', f.pa.id))
    await undo(removed.operationId!)
    const events = await prisma.workshopEvent.findMany()
    expect(events.length).toBeGreaterThanOrEqual(5)
    for (const event of events) {
      expect(auditStateSchema.safeParse(event.before).success).toBe(true)
      expect(auditStateSchema.safeParse(event.after).success).toBe(true)
      expect(event.wasPublished).toBe(false)
    }
  })

  it('acknowledges an exact publication retry after subsequent changes without publishing twice', async () => {
    await coverage()
    const row = await draft()
    await editDraftTeam(await editInput(row.id, 'assign', f.pa.id))
    const snapshot = await store.loadSchedule(prisma, {
      kind: 'run',
      workshopDefinitionId: definitionId,
    })
    const request = {
      requestKey: randomUUID(),
      inputHash: scheduleHash(snapshot),
      scope: { workshopDefinitionId: definitionId },
      entries: [{ id: row.id, version: (await team(row.id)).version }],
    }
    const result = await publishSelectedDrafts(request)
    expect(result.success).toContain('1 teacher session published')
    await prisma.workshopSession.update({
      where: { id: row.id },
      data: { notes: 'Later admin edit', version: { increment: 1 } },
    })
    expect(await publishSelectedDrafts(request)).toEqual(result)
    expect(
      await prisma.workshopEvent.count({ where: { workshopSessionId: row.id, kind: 'PUBLISH' } })
    ).toBe(1)
    expect(await prisma.publicationReceipt.count()).toBe(1)
    expect((await team(row.id)).notes).toBe('Later admin edit')
    expect(
      await publishSelectedDrafts({ ...request, entries: [{ id: row.id, version: 999 }] })
    ).toMatchObject({ error: expect.stringContaining('request changed') })
    const otherAdmin = await prisma.user.create({
      data: { email: 'other-admin@fixture.local', role: 'ADMIN' },
    })
    sessionAuth.mockResolvedValue({ user: { id: otherAdmin.id } })
    expect(await publishSelectedDrafts(request)).toMatchObject({
      error: expect.stringContaining('request changed'),
    })
  })

  it('does not save a publication receipt when staffing validation fails', async () => {
    const row = await draft()
    const snapshot = await store.loadSchedule(prisma, {
      kind: 'run',
      workshopDefinitionId: definitionId,
    })
    const result = await publishSelectedDrafts({
      requestKey: randomUUID(),
      inputHash: scheduleHash(snapshot),
      scope: { workshopDefinitionId: definitionId },
      entries: [{ id: row.id, version: row.version }],
    })
    expect(result.error).toContain('Minimum staffing')
    expect(await prisma.publicationReceipt.count()).toBe(0)
    expect((await team(row.id)).status).toBe('DRAFT')
  })
})
