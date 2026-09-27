import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { prisma } from '../../src/lib/db'
import { loadSchedule } from '../../src/lib/scheduling/store'
import { vancouverToUtc } from '../../src/lib/time'
import { createWorkshopBatch } from '../../src/app/admin/workshops/plan/actions'
import { autoFillDraftTeam } from '../../src/app/admin/workshop-definitions/[id]/staffing-actions'
import { assignPA, publishWorkshop } from '../../src/app/admin/staffing/actions'
import { createSessionFixture, form, resetFixtures, staffingForm } from '../fixtures'

const { sessionAuth } = vi.hoisted(() => ({ sessionAuth: vi.fn() }))
vi.mock('next-auth', () => ({ default: () => ({ auth: sessionAuth }) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error('REDIRECT:' + url)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

let f: Awaited<ReturnType<typeof resetFixtures>>

beforeEach(async () => {
  f = await resetFixtures()
  sessionAuth.mockResolvedValue({ user: { id: f.admin.id } })
})

afterAll(() => prisma.$disconnect())

describe('local pilot rehearsal', () => {
  it('plans one named run across schools, ignores quotas, preserves manual work, and publishes', async () => {
    const otherClass = await prisma.classSection.create({
      data: {
        name: 'Second School Physics',
        teacherId: f.otherTeacher.id,
        schoolId: f.otherSchool.id,
        defaultMaxPAs: 1,
        meetings: {
          create: {
            dayOfWeek: 0,
            startMinute: 540,
            endMinute: 720,
            activeForScheduling: true,
          },
        },
      },
    })
    await prisma.workshopDefinition.update({
      where: { id: 'fixture-definition-1' },
      data: {
        deliveryStartsOn: new Date('2027-01-04T00:00:00.000Z'),
        deliveryEndsOn: new Date('2027-01-22T00:00:00.000Z'),
        defaultMinPAs: 1,
        defaultMaxPAs: 1,
      },
    })
    const classWorkshops = await Promise.all(
      [f.cls.id, otherClass.id].map((classSectionId) =>
        prisma.classWorkshop.create({
          data: { classSectionId, workshopDefinitionId: 'fixture-definition-1' },
        })
      )
    )
    const secondPA = await prisma.user.create({
      data: { email: 'second@fixture.local', name: 'Second PA', role: 'PA' },
    })
    for (const [paId, quota] of [
      [f.pa.id, 0],
      [secondPA.id, 1],
    ] as const) {
      await prisma.monthlyPAQuota.create({ data: { paId, quota, month: '2027-01' } })
      await prisma.availability.createMany({
        data: [0, 1].flatMap((dayOfWeek) =>
          [600, 615, 630, 645].map((startMin) => ({ userId: paId, dayOfWeek, startMin }))
        ),
      })
    }
    const batch = form({
      requestKey: randomUUID(),
      workshopDefinitionId: 'fixture-definition-1',
      expectedDefinitionRevision: 0,
      mode: 'IN_PERSON',
    })
    for (const selection of [
      { classWorkshopId: classWorkshops[0].id, date: '2027-01-05' },
      { classWorkshopId: classWorkshops[1].id, date: '2027-01-11' },
    ]) {
      batch.append('classWorkshopId', selection.classWorkshopId)
      batch.append('date', selection.date)
      batch.append('startTime', '10:00')
    }
    await expect(createWorkshopBatch(batch)).rejects.toThrow('batch=')
    const sessions = await prisma.workshopSession.findMany({ orderBy: { scheduledStart: 'asc' } })
    await expect(assignPA(await staffingForm(sessions[1].id, 0, secondPA.id))).rejects.toThrow(
      'staffed=1'
    )
    const savedDrafts = await prisma.workshopSession.findMany()
    expect(
      (
        await autoFillDraftTeam({
          workshopDefinitionId: 'fixture-definition-1',
          requestKey: randomUUID(),
          entries: savedDrafts.map(({ id, version }) => ({ id, version })),
        })
      ).message
    ).toContain('Added 1')
    expect(await prisma.assignment.count()).toBe(2)
    expect(
      (await prisma.assignment.findFirstOrThrow({ where: { workshopSessionId: sessions[1].id } }))
        .source
    ).toBe('MANUAL')
    expect(await prisma.assignment.count({ where: { paId: f.pa.id } })).toBeGreaterThanOrEqual(1)
    for (const workshop of await prisma.workshopSession.findMany())
      await expect(
        publishWorkshop(form({ id: workshop.id, version: workshop.version }))
      ).rejects.toThrow('published=1')
    expect(await prisma.workshopSession.count({ where: { status: 'PUBLISHED' } })).toBe(2)
  })

  it('treats Friday and the following Monday as different Vancouver workload weeks', async () => {
    await prisma.availability.createMany({
      data: [600, 615, 630, 645].map((startMin) => ({
        userId: f.pa.id,
        dayOfWeek: 0,
        startMin,
      })),
    })
    const prior = await createSessionFixture({
      data: {
        classSectionId: f.cls.id,
        status: 'PUBLISHED',
        locked: true,
        scheduledStart: vancouverToUtc('2027-01-29', 600),
        scheduledEnd: vancouverToUtc('2027-01-29', 660),
        assignments: { create: { paId: f.pa.id, status: 'PUBLISHED' } },
      },
    })
    const target = await createSessionFixture({
      data: {
        classSectionId: f.sibling.id,
        scheduledStart: vancouverToUtc('2027-02-01', 600),
        scheduledEnd: vancouverToUtc('2027-02-01', 660),
      },
    })
    const enrollment = await prisma.classWorkshop.findUniqueOrThrow({
      where: { id: target.classWorkshopId },
    })
    expect(
      (
        await autoFillDraftTeam({
          workshopDefinitionId: enrollment.workshopDefinitionId,
          requestKey: randomUUID(),
          entries: [{ id: target.id, version: target.version }],
        })
      ).message
    ).toContain('Added 1')
    expect(await prisma.assignment.count()).toBe(2)
    expect(await prisma.assignment.count({ where: { workshopSessionId: prior.id } })).toBe(1)
    const totals = (await loadSchedule(prisma)).assignmentTotals
    expect(totals?.[f.pa.id] ?? 0).toBe(2)
  })
})
