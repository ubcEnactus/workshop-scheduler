import { afterAll, beforeEach, expect, it, vi } from 'vitest'

import { prisma } from '../../src/lib/db'
import {
  summarizeWorkshopDeletion,
  workshopDeletionInclude,
} from '../../src/lib/scheduling/workshop-deletion'
import { vancouverToUtc } from '../../src/lib/time'
import { form, resetFixtures } from '../fixtures'

const { sessionAuth } = vi.hoisted(() => ({ sessionAuth: vi.fn() }))
vi.mock('next-auth', () => ({ default: () => ({ auth: sessionAuth }) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error('REDIRECT:' + url)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { deleteWorkshopDefinition } from '../../src/app/admin/class-workshops/actions'
import { applyMatching } from '../../src/app/admin/workshops/match/actions'

let fixture: Awaited<ReturnType<typeof resetFixtures>>

beforeEach(async () => {
  fixture = await resetFixtures()
  sessionAuth.mockResolvedValue({ user: { id: fixture.admin.id } })
})

afterAll(() => prisma.$disconnect())

async function deletionSummary(id: string) {
  const record = await prisma.workshopDefinition.findUniqueOrThrow({
    where: { id },
    include: workshopDeletionInclude,
  })
  return summarizeWorkshopDeletion(record)
}

it('deletes the complete private draft graph and preserves shared and unrelated records', async () => {
  const preservedUserCount = await prisma.user.count()
  const batch = await prisma.workshopBatch.create({
    data: {
      requestKey: 'delete-target-batch',
      actorId: fixture.admin.id,
      month: '2027-01',
      payloadHash: 'target-batch',
    },
  })
  const targetEnrollment = await prisma.classWorkshop.create({
    data: {
      classSectionId: fixture.cls.id,
      workshopDefinitionId: 'fixture-definition-1',
      availabilitySlots: {
        create: {
          start: vancouverToUtc('2027-01-04', 600),
          end: vancouverToUtc('2027-01-04', 660),
          notes: 'Target-only candidate',
        },
      },
    },
  })
  const targetSession = await prisma.workshopSession.create({
    data: {
      classWorkshopId: targetEnrollment.id,
      batchId: batch.id,
      scheduledStart: vancouverToUtc('2027-01-04', 600),
      scheduledEnd: vancouverToUtc('2027-01-04', 660),
      assignments: {
        create: { paId: fixture.pa.id, status: 'DRAFT', source: 'MANUAL' },
      },
    },
  })
  await Promise.all([
    prisma.workshopChange.create({
      data: {
        workshopSessionId: targetSession.id,
        actorId: fixture.admin.id,
        payload: { private: true },
        before: { status: 'DRAFT' },
        proposed: { status: 'DRAFT' },
      },
    }),
    prisma.workshopEvent.create({
      data: {
        workshopSessionId: targetSession.id,
        actorId: fixture.admin.id,
        actorName: 'Fixture Admin',
        kind: 'INTERNAL_EDIT',
        reason: 'Private draft note',
        before: { status: 'DRAFT' },
        after: { status: 'DRAFT' },
        wasPublished: false,
        affectedPAIds: [fixture.pa.id],
      },
    }),
  ])

  const otherEnrollment = await prisma.classWorkshop.create({
    data: {
      classSectionId: fixture.sibling.id,
      workshopDefinitionId: 'fixture-definition-2',
      availabilitySlots: {
        create: {
          start: vancouverToUtc('2027-01-05', 600),
          end: vancouverToUtc('2027-01-05', 660),
        },
      },
    },
  })
  const otherSession = await prisma.workshopSession.create({
    data: {
      classWorkshopId: otherEnrollment.id,
      batchId: batch.id,
      scheduledStart: vancouverToUtc('2027-01-05', 600),
      scheduledEnd: vancouverToUtc('2027-01-05', 660),
    },
  })
  const sharedSlot = await prisma.availabilitySlot.create({
    data: {
      classSectionId: fixture.cls.id,
      start: vancouverToUtc('2027-01-06', 600),
      end: vancouverToUtc('2027-01-06', 660),
    },
  })
  const paAvailability = await prisma.availability.create({
    data: { userId: fixture.pa.id, dayOfWeek: 0, startMin: 600 },
  })
  const preview = await prisma.matchingPreview.create({
    data: {
      actorId: fixture.admin.id,
      month: '2027-01',
      classIds: { kind: 'workshop', workshopDefinitionId: 'fixture-definition-1' },
      inputHash: 'a'.repeat(64),
      plan: [],
      expiresAt: new Date(Date.now() + 60_000),
    },
  })
  const summary = await deletionSummary('fixture-definition-1')
  expect(summary).toMatchObject({
    includedClasses: 1,
    draftSessions: 1,
    assignments: 1,
    candidateTimes: 1,
  })
  expect(summary.blockedReason).toBeUndefined()

  await expect(
    deleteWorkshopDefinition(
      form({
        workshopDefinitionId: 'fixture-definition-1',
        expectedHash: summary.hash,
        confirm: '1',
      })
    )
  ).rejects.toThrow('REDIRECT:/admin/workshop-definitions?deleted=1')

  expect(
    await prisma.workshopDefinition.findUnique({ where: { id: 'fixture-definition-1' } })
  ).toBeNull()
  expect(await prisma.classWorkshop.findUnique({ where: { id: targetEnrollment.id } })).toBeNull()
  expect(await prisma.workshopSession.findUnique({ where: { id: targetSession.id } })).toBeNull()
  expect(await prisma.assignment.count({ where: { workshopSessionId: targetSession.id } })).toBe(0)
  expect(
    await prisma.workshopChange.count({ where: { workshopSessionId: targetSession.id } })
  ).toBe(0)
  expect(await prisma.workshopEvent.count({ where: { workshopSessionId: targetSession.id } })).toBe(
    0
  )

  expect(await prisma.classSection.count()).toBe(2)
  expect(await prisma.school.count()).toBe(2)
  expect(await prisma.user.count()).toBe(preservedUserCount)
  expect(await prisma.availabilitySlot.findUnique({ where: { id: sharedSlot.id } })).not.toBeNull()
  expect(await prisma.availability.findUnique({ where: { id: paAvailability.id } })).not.toBeNull()
  expect(
    await prisma.workshopDefinition.findUnique({ where: { id: 'fixture-definition-2' } })
  ).not.toBeNull()
  expect(
    await prisma.classWorkshop.findUnique({ where: { id: otherEnrollment.id } })
  ).not.toBeNull()
  expect(await prisma.workshopSession.findUnique({ where: { id: otherSession.id } })).not.toBeNull()
  expect(await prisma.workshopBatch.findUnique({ where: { id: batch.id } })).not.toBeNull()
  expect(await prisma.matchingPreview.findUnique({ where: { id: preview.id } })).not.toBeNull()
  await expect(applyMatching(form({ id: preview.id }))).rejects.toThrow(
    'Archived+proposals+cannot+change+the+saved+draft'
  )
  expect(
    await prisma.workshopSession.count({ where: { classWorkshopId: targetEnrollment.id } })
  ).toBe(0)
})

type ProtectedHistoryFixture = (enrollmentId: string) => Promise<void>

const protectedHistoryCases: [string, ProtectedHistoryFixture][] = [
  [
    'a published session',
    async (classWorkshopId) => {
      await prisma.workshopSession.create({
        data: {
          classWorkshopId,
          status: 'PUBLISHED',
          scheduledStart: vancouverToUtc('2027-01-04', 600),
          scheduledEnd: vancouverToUtc('2027-01-04', 660),
        },
      })
    },
  ],
  [
    'a completed session',
    async (classWorkshopId) => {
      await prisma.workshopSession.create({
        data: {
          classWorkshopId,
          status: 'COMPLETED',
          scheduledStart: vancouverToUtc('2027-01-04', 600),
          scheduledEnd: vancouverToUtc('2027-01-04', 660),
        },
      })
    },
  ],
  [
    'a cancelled session',
    async (classWorkshopId) => {
      await prisma.workshopSession.create({
        data: {
          classWorkshopId,
          status: 'CANCELLED',
          scheduledStart: vancouverToUtc('2027-01-04', 600),
          scheduledEnd: vancouverToUtc('2027-01-04', 660),
        },
      })
    },
  ],
  [
    'a publication timestamp on a draft session',
    async (classWorkshopId) => {
      await prisma.workshopSession.create({
        data: {
          classWorkshopId,
          scheduledStart: vancouverToUtc('2027-01-04', 600),
          scheduledEnd: vancouverToUtc('2027-01-04', 660),
          publishedAt: new Date('2027-01-01T00:00:00.000Z'),
        },
      })
    },
  ],
  [
    'a published assignment on a draft session',
    async (classWorkshopId) => {
      await prisma.workshopSession.create({
        data: {
          classWorkshopId,
          scheduledStart: vancouverToUtc('2027-01-04', 600),
          scheduledEnd: vancouverToUtc('2027-01-04', 660),
          assignments: { create: { paId: fixture.pa.id, status: 'PUBLISHED' } },
        },
      })
    },
  ],
  [
    'a previously published event on a draft session',
    async (classWorkshopId) => {
      await prisma.workshopSession.create({
        data: {
          classWorkshopId,
          scheduledStart: vancouverToUtc('2027-01-04', 600),
          scheduledEnd: vancouverToUtc('2027-01-04', 660),
          events: {
            create: {
              actorId: fixture.admin.id,
              actorName: 'Fixture Admin',
              kind: 'PUBLISH',
              reason: 'Published',
              before: { status: 'DRAFT' },
              after: { status: 'PUBLISHED' },
              wasPublished: true,
              affectedPAIds: [fixture.pa.id],
            },
          },
        },
      })
    },
  ],
  [
    'a completed enrollment without a session',
    async (classWorkshopId) => {
      await prisma.classWorkshop.update({
        where: { id: classWorkshopId },
        data: { status: 'COMPLETED' },
      })
    },
  ],
]

it.each(protectedHistoryCases)('blocks deletion for %s', async (_label, createHistory) => {
  const enrollment = await prisma.classWorkshop.create({
    data: {
      classSectionId: fixture.cls.id,
      workshopDefinitionId: 'fixture-definition-1',
    },
  })
  await createHistory(enrollment.id)

  const summary = await deletionSummary('fixture-definition-1')
  expect(summary.blockedReason).toBe(
    'This workshop has published, completed, or cancelled history and cannot be deleted.'
  )
  await expect(
    deleteWorkshopDefinition(
      form({
        workshopDefinitionId: 'fixture-definition-1',
        expectedHash: summary.hash,
        confirm: '1',
      })
    )
  ).rejects.toThrow('cannot%20be%20deleted')
  expect(
    await prisma.workshopDefinition.findUnique({ where: { id: 'fixture-definition-1' } })
  ).not.toBeNull()
})

it('requires confirmation, rejects stale reviewed graphs, and sends missing workshops to the list', async () => {
  const enrollment = await prisma.classWorkshop.create({
    data: {
      classSectionId: fixture.cls.id,
      workshopDefinitionId: 'fixture-definition-1',
      availabilitySlots: {
        create: {
          start: vancouverToUtc('2027-01-04', 600),
          end: vancouverToUtc('2027-01-04', 660),
        },
      },
    },
    include: { availabilitySlots: true },
  })
  const summary = await deletionSummary('fixture-definition-1')
  await expect(
    deleteWorkshopDefinition(
      form({ workshopDefinitionId: 'fixture-definition-1', expectedHash: summary.hash })
    )
  ).rejects.toThrow('Confirm%20permanent%20workshop%20deletion')

  await prisma.availabilitySlot.update({
    where: { id: enrollment.availabilitySlots[0].id },
    data: { notes: 'Changed after review' },
  })
  await expect(
    deleteWorkshopDefinition(
      form({
        workshopDefinitionId: 'fixture-definition-1',
        expectedHash: summary.hash,
        confirm: '1',
      })
    )
  ).rejects.toThrow('changed%20after%20you%20reviewed')
  expect(
    await prisma.workshopDefinition.findUnique({ where: { id: 'fixture-definition-1' } })
  ).not.toBeNull()

  await expect(
    deleteWorkshopDefinition(
      form({
        workshopDefinitionId: 'missing-workshop',
        expectedHash: 'a'.repeat(64),
        confirm: '1',
      })
    )
  ).rejects.toThrow(
    'REDIRECT:/admin/workshop-definitions?error=Workshop%20is%20no%20longer%20available.'
  )
})

it('authorizes before parsing for teachers and PAs', async () => {
  for (const user of [fixture.teacher, fixture.pa]) {
    sessionAuth.mockResolvedValue({ user: { id: user.id } })
    await expect(deleteWorkshopDefinition(new FormData())).rejects.toThrow('/403')
  }
})
