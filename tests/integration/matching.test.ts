import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../src/lib/db'
import { createSessionFixture, form, resetFixtures } from '../fixtures'
import { vancouverToUtc } from '../../src/lib/time'

const { sessionAuth } = vi.hoisted(() => ({ sessionAuth: vi.fn() }))
vi.mock('next-auth', () => ({ default: () => ({ auth: sessionAuth }) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error('REDIRECT:' + url)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
import {
  previewMatching,
  applyMatching,
  editPreviewStaffing,
} from '../../src/app/admin/workshops/match/actions'

let f: Awaited<ReturnType<typeof resetFixtures>>
beforeEach(async () => {
  f = await resetFixtures()
  sessionAuth.mockResolvedValue({ user: { id: f.admin.id } })
})
afterAll(() => prisma.$disconnect())

describe('retired proposal write paths', () => {
  it.each([previewMatching, applyMatching, editPreviewStaffing])(
    'authorizes before parsing an archived action',
    async (action) => {
      for (const user of [f.pa, f.teacher]) {
        sessionAuth.mockResolvedValue({ user: { id: user.id } })
        await expect(action(new FormData())).rejects.toThrow('/403')
      }
    }
  )

  it('routes workshop, selected-session and batch forms to the same persistent draft without preview writes', async () => {
    const id = 'fixture-definition-1'
    await expect(previewMatching(form({ workshopDefinitionId: id }))).rejects.toThrow(
      `/admin/workshop-definitions/${id}?step=staff`
    )
    await expect(
      previewMatching(form({ scopeKind: 'batch', workshopDefinitionId: id, batchId: 'batch-id' }))
    ).rejects.toThrow('step=staff&batch=batch-id')
    await expect(
      previewMatching(
        form({ scopeKind: 'sessions', workshopDefinitionId: id, sessionId: 'session-id' })
      )
    ).rejects.toThrow('step=staff&sessionId=session-id')
    await expect(previewMatching(form({ month: '2027-01', classId: f.cls.id }))).rejects.toThrow(
      '/admin/workshops/match?month=2027-01'
    )
    expect(await prisma.matchingPreview.count()).toBe(0)
    expect(await prisma.assignment.count()).toBe(0)
    expect(await prisma.draftStaffingOperation.count()).toBe(0)
  })

  it.each([new Date(0), new Date('2100-01-01')])(
    'retains archived proposals and teams without applying or editing them (expiration %s)',
    async (expiresAt) => {
      const session = await createSessionFixture({
        data: {
          classSectionId: f.cls.id,
          scheduledStart: vancouverToUtc('2027-01-04', 600),
          scheduledEnd: vancouverToUtc('2027-01-04', 660),
          assignments: { create: { paId: f.pa.id, source: 'AUTOMATIC' } },
        },
      })
      const proposal = await prisma.matchingPreview.create({
        data: {
          actorId: f.admin.id,
          month: '2027-01',
          classIds: [f.cls.id],
          inputHash: 'outdated',
          plan: [{ workshopSessionId: session.id, paIds: ['must-not-replace'] }],
          expiresAt,
        },
      })
      const assignment = await prisma.assignment.findFirstOrThrow()
      for (const operation of ['inspect', 'add', 'remove']) {
        expect(
          (
            await editPreviewStaffing({
              id: proposal.id,
              workshopSessionId: session.id,
              operation,
              paId: f.pa.id,
              expectedPlanHash: 'a'.repeat(64),
              expectedPolicyHash: 'b'.repeat(64),
            })
          ).error
        ).toContain('archived proposal')
      }
      await expect(applyMatching(form({ id: proposal.id }))).rejects.toThrow(
        'Archived+proposals+cannot+change+the+saved+draft'
      )
      expect(await prisma.assignment.findFirstOrThrow()).toEqual(assignment)
      expect(
        await prisma.matchingPreview.findUniqueOrThrow({ where: { id: proposal.id } })
      ).toEqual(proposal)
      expect(await prisma.workshopEvent.count()).toBe(0)
    }
  )

  it('does not expose or write another admin’s archived proposal', async () => {
    const proposal = await prisma.matchingPreview.create({
      data: {
        actorId: 'another-admin',
        month: '2027-01',
        classIds: [f.cls.id],
        inputHash: '',
        plan: [],
        expiresAt: new Date(0),
      },
    })
    await expect(applyMatching(form({ id: proposal.id }))).rejects.toThrow('Proposal+unavailable')
    expect(
      (await prisma.matchingPreview.findUniqueOrThrow({ where: { id: proposal.id } })).appliedAt
    ).toBeNull()
    expect(await prisma.assignment.count()).toBe(0)
  })
})
