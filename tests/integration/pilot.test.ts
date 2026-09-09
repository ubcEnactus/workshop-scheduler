import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '../../src/lib/db'
import { form, resetFixtures, workshopForm } from '../fixtures'
import { loadSchedule } from '../../src/lib/scheduling/store'
import { workload } from '../../src/lib/scheduling/eligibility'
import { vancouverToUtc } from '../../src/lib/time'
const { sessionAuth } = vi.hoisted(() => ({ sessionAuth: vi.fn() }))
vi.mock('next-auth', () => ({ default: () => ({ auth: sessionAuth }) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error('REDIRECT:' + url)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
import { createWorkshopBatch } from '../../src/app/admin/workshops/plan/actions'
import { previewMatching, applyMatching } from '../../src/app/admin/workshops/match/actions'
import { assignPA, publishWorkshop, saveQuota } from '../../src/app/admin/staffing/actions'
import {
  stageWorkshopChange,
  applyWorkshopChange,
} from '../../src/app/admin/workshops/changes/actions'
import { createWorkshop } from '../../src/app/admin/workshops/actions'
let f: Awaited<ReturnType<typeof resetFixtures>>
beforeEach(async () => {
  f = await resetFixtures()
  sessionAuth.mockResolvedValue({ user: { id: f.admin.id } })
})
afterAll(async () => {
  await prisma.$disconnect()
})
describe('local pilot rehearsal', () => {
  it('plans across schools, staffs uneven quotas, protects manual work and handles an ad hoc replacement', async () => {
    const cls = await prisma.classSection.create({
      data: {
        name: 'Second School Physics',
        teacherId: f.otherTeacher.id,
        schoolId: f.otherSchool.id,
        monthlyCadence: 2,
        meetings: { create: { dayOfWeek: 0, startMinute: 540, endMinute: 720 } },
      },
    })
    const b = await prisma.user.create({
      data: { email: 'b@fixture.local', name: 'Monday PA', role: 'PA' },
    })
    const zero = await prisma.user.create({
      data: { email: 'zero@fixture.local', name: 'Zero quota PA', role: 'PA' },
    })
    await prisma.schedulingSettings.update({ where: { id: 1 }, data: { minimumGapMinutes: 60 } })
    for (const [paId, quota, days] of [
      [f.pa.id, 1, [0, 1]],
      [b.id, 2, [0]],
      [zero.id, 0, [0, 1]],
    ] as const) {
      await prisma.monthlyPAQuota.create({ data: { paId, quota, month: '2027-01' } })
      await prisma.availability.createMany({
        data: days.flatMap((dayOfWeek) =>
          [600, 630].map((startMin) => ({ userId: paId, dayOfWeek, startMin }))
        ),
      })
    }
    const batch = form({ requestKey: randomUUID(), month: '2027-01' })
    for (const [classSectionId, date] of [
      [f.cls.id, '2027-01-05'],
      [cls.id, '2027-01-11'],
      [cls.id, '2027-01-18'],
    ]) {
      for (const [key, value] of Object.entries({
        classSectionId,
        date,
        startTime: '10:00',
        durationMinutes: '60',
        minPAs: '1',
        maxPAs: '1',
      }))
        batch.append(key, value)
    }
    await expect(createWorkshopBatch(batch)).rejects.toThrow('batch=')
    const ws = await prisma.workshop.findMany({ orderBy: { scheduledStart: 'asc' } }),
      dates = ws.map((w) => w.scheduledStart)
    await expect(assignPA(form({ id: ws[2].id, version: 0, paId: b.id }))).rejects.toThrow(
      'staffed=1'
    )
    const scope = form({ month: '2027-01' })
    scope.append('classId', f.cls.id)
    scope.append('classId', cls.id)
    await expect(previewMatching(scope)).rejects.toThrow('/match/')
    const preview = await prisma.matchingPreview.findFirstOrThrow()
    await expect(applyMatching(form({ id: preview.id }))).rejects.toThrow('matched=1')
    for (const w of await prisma.workshop.findMany())
      await expect(publishWorkshop(form({ id: w.id, version: w.version }))).rejects.toThrow(
        'published=1'
      )
    const s = await loadSchedule(prisma)
    expect(workload(s, f.pa.id, '2027-01')).toBe(1)
    expect(workload(s, b.id, '2027-01')).toBe(2)
    expect(workload(s, zero.id, '2027-01')).toBe(0)
    expect(
      (await prisma.workshop.findMany({ orderBy: { scheduledStart: 'asc' } })).map(
        (w) => w.scheduledStart
      )
    ).toEqual(dates)
    expect(
      (await prisma.assignment.findFirstOrThrow({ where: { workshopId: ws[2].id } })).source
    ).toBe('MANUAL')
    const w = await prisma.workshop.findUniqueOrThrow({ where: { id: ws[1].id } })
    const replace = form({
      id: w.id,
      version: w.version,
      kind: 'REPLACE',
      oldPaId: b.id,
      newPaId: f.pa.id,
      reason: 'Ad hoc replacement',
    })
    await expect(stageWorkshopChange(replace)).rejects.toThrow('quota')
    await expect(saveQuota(form({ paId: f.pa.id, month: '2027-01', quota: 2 }))).rejects.toThrow(
      'saved=1'
    )
    await expect(stageWorkshopChange(replace)).rejects.toThrow('/changes/')
    const change = await prisma.workshopChange.findFirstOrThrow()
    await expect(applyWorkshopChange(form({ id: change.id }))).rejects.toThrow('changed=1')
    expect(workload(await loadSchedule(prisma), f.pa.id, '2027-01')).toBe(2)
    expect(await prisma.workshop.count({ where: { status: 'PUBLISHED' } })).toBe(3)
  })
  it('retains adjacent-month commitments and explains an unfillable dated slot', async () => {
    await prisma.schedulingSettings.update({
      where: { id: 1 },
      data: { minimumGapMinutes: 4 * 24 * 60 },
    })
    await prisma.monthlyPAQuota.create({ data: { paId: f.pa.id, month: '2027-02', quota: 1 } })
    await prisma.availability.createMany({
      data: [600, 630].map((startMin) => ({ userId: f.pa.id, dayOfWeek: 0, startMin })),
    })
    const prior = await prisma.workshop.create({
      data: {
        classSectionId: f.cls.id,
        status: 'PUBLISHED',
        locked: true,
        scheduledStart: vancouverToUtc('2027-01-29', 600),
        scheduledEnd: vancouverToUtc('2027-01-29', 660),
        assignments: { create: { paId: f.pa.id, status: 'PUBLISHED' } },
      },
    })
    await expect(createWorkshop(workshopForm(f.cls.id, { date: '2027-02-01' }))).rejects.toThrow(
      'saved=1'
    )
    await expect(previewMatching(form({ month: '2027-02', classId: f.cls.id }))).rejects.toThrow(
      '/match/'
    )
    const p = await prisma.matchingPreview.findFirstOrThrow()
    expect(JSON.stringify(p.plan)).toContain('Insufficient gap')
    await expect(applyMatching(form({ id: p.id }))).rejects.toThrow('matched=1')
    expect(await prisma.assignment.count()).toBe(1)
    expect((await prisma.assignment.findFirstOrThrow()).workshopId).toBe(prior.id)
  })
})
