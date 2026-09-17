import { readFile } from 'node:fs/promises'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../src/lib/db'
import { form, resetFixtures } from '../fixtures'
import { vancouverToUtc } from '../../src/lib/time'
const { sessionAuth } = vi.hoisted(() => ({ sessionAuth: vi.fn() }))
vi.mock('next-auth', () => ({ default: () => ({ auth: sessionAuth }) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error('REDIRECT:' + url)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
import { assignPA, publishWorkshop, saveGap } from '../../src/app/admin/staffing/actions'
import {
  stageWorkshopChange,
  applyWorkshopChange,
} from '../../src/app/admin/workshops/changes/actions'
import { previewMatching, applyMatching } from '../../src/app/admin/workshops/match/actions'

let f: Awaited<ReturnType<typeof resetFixtures>>
beforeEach(async () => {
  f = await resetFixtures()
  sessionAuth.mockResolvedValue({ user: { id: f.admin.id } })
  await prisma.schedulingSettings.update({ where: { id: 1 }, data: { minimumGapDays: 1 } })
  await preparePA(f.pa.id)
})
afterAll(async () => {
  await prisma.$disconnect()
})
async function preparePA(paId: string) {
  await prisma.monthlyPAQuota.create({ data: { paId, month: '2027-01', quota: 10 } })
  await prisma.availability.createMany({
    data: [0, 1].flatMap((dayOfWeek) =>
      Array.from({ length: 12 }, (_, i) => ({ userId: paId, dayOfWeek, startMin: 540 + i * 30 }))
    ),
  })
}
async function draft(second = false, date = '2027-01-04') {
  return prisma.workshop.create({
    data: {
      classSectionId: second ? f.sibling.id : f.cls.id,
      scheduledStart: vancouverToUtc(date, second ? 660 : 600),
      scheduledEnd: vancouverToUtc(date, second ? 720 : 660),
      minPAs: 1,
      maxPAs: 1,
    },
  })
}
async function staff(id: string, paId = f.pa.id) {
  return prisma.assignment.create({
    data: { workshopId: id, paId, status: 'DRAFT', source: 'MANUAL' },
  })
}
const schoolConflict = 'already%20has%20a%20workshop%20at%20this%20school'

describe('calendar-day spacing across mutation paths', () => {
  it('keeps the selected quota month after saving the global gap', async () => {
    await expect(saveGap(form({ minimumGapDays: 2, month: '2027-01' }))).rejects.toThrow(
      'REDIRECT:/admin/staffing?month=2027-01&saved=1'
    )
    expect(
      (await prisma.schedulingSettings.findUniqueOrThrow({ where: { id: 1 } })).minimumGapDays
    ).toBe(2)
  })
  it('rejects a second same-school class without changing its version or assignments', async () => {
    const first = await draft(),
      second = await draft(true)
    await expect(assignPA(form({ id: first.id, version: 0, paId: f.pa.id }))).rejects.toThrow(
      'staffed=1'
    )
    await expect(assignPA(form({ id: second.id, version: 0, paId: f.pa.id }))).rejects.toThrow(
      schoolConflict
    )
    expect(await prisma.assignment.count()).toBe(1)
    expect((await prisma.workshop.findUniqueOrThrow({ where: { id: second.id } })).version).toBe(0)
  })
  it('serializes concurrent non-overlapping same-school assignments', async () => {
    const first = await draft(),
      second = await draft(true)
    await Promise.allSettled(
      [first, second].map((w) => assignPA(form({ id: w.id, version: 0, paId: f.pa.id })))
    )
    expect(await prisma.assignment.count()).toBe(1)
    expect((await prisma.workshop.findMany()).reduce((sum, w) => sum + w.version, 0)).toBe(1)
  })
  it('rechecks same-day conflicts at publication and preserves the draft', async () => {
    const first = await draft(),
      second = await draft(true)
    await staff(first.id)
    await staff(second.id)
    await expect(publishWorkshop(form({ id: first.id, version: 0 }))).rejects.toThrow(
      schoolConflict
    )
    expect((await prisma.workshop.findUniqueOrThrow({ where: { id: first.id } })).status).toBe(
      'DRAFT'
    )
    expect(await prisma.workshopEvent.count()).toBe(0)
  })
  it('rechecks replacement during staging and apply, preserving the old PA on failure', async () => {
    const replacement = await prisma.user.create({
      data: { email: 'replacement@fixture.local', role: 'PA' },
    })
    await preparePA(replacement.id)
    const first = await draft(),
      second = await draft(true)
    await staff(first.id)
    await staff(second.id, replacement.id)
    const request = form({
      id: first.id,
      version: 0,
      kind: 'REPLACE',
      oldPaId: f.pa.id,
      newPaId: replacement.id,
      reason: 'Check day spacing',
    })
    await expect(stageWorkshopChange(request)).rejects.toThrow(schoolConflict)
    expect(await prisma.workshopChange.count()).toBe(0)
    await prisma.assignment.deleteMany({ where: { workshopId: second.id } })
    await expect(stageWorkshopChange(request)).rejects.toThrow('/changes/')
    const change = await prisma.workshopChange.findFirstOrThrow()
    await staff(second.id, replacement.id)
    await expect(applyWorkshopChange(form({ id: change.id }))).rejects.toThrow(schoolConflict)
    expect(
      (await prisma.assignment.findFirstOrThrow({ where: { workshopId: first.id } })).paId
    ).toBe(f.pa.id)
    expect(
      (await prisma.workshopChange.findUniqueOrThrow({ where: { id: change.id } })).appliedAt
    ).toBeNull()
    expect(await prisma.workshopEvent.count()).toBe(0)
  })
  it('rechecks rescheduling during staging and apply without moving the original date', async () => {
    const first = await draft(),
      second = await draft(true, '2027-01-05')
    await staff(first.id)
    await staff(second.id)
    const request = form({
      id: first.id,
      version: 0,
      kind: 'RESCHEDULE',
      date: '2027-01-05',
      startTime: '10:00',
      endTime: '11:00',
      reason: 'Check day spacing',
    })
    await expect(stageWorkshopChange(request)).rejects.toThrow(schoolConflict)
    await prisma.assignment.deleteMany({ where: { workshopId: second.id } })
    await expect(stageWorkshopChange(request)).rejects.toThrow('/changes/')
    const change = await prisma.workshopChange.findFirstOrThrow()
    await staff(second.id)
    await expect(applyWorkshopChange(form({ id: change.id }))).rejects.toThrow(schoolConflict)
    expect(
      (await prisma.workshop.findUniqueOrThrow({ where: { id: first.id } })).scheduledStart
    ).toEqual(first.scheduledStart)
    expect(await prisma.workshopEvent.count()).toBe(0)
  })
  it('counts completed commitments but allows another visit after cancellation', async () => {
    const first = await draft(),
      second = await draft(true)
    await staff(first.id)
    await prisma.workshop.update({ where: { id: first.id }, data: { status: 'COMPLETED' } })
    await expect(assignPA(form({ id: second.id, version: 0, paId: f.pa.id }))).rejects.toThrow(
      schoolConflict
    )
    await prisma.workshop.update({ where: { id: first.id }, data: { status: 'DRAFT' } })
    await expect(
      stageWorkshopChange(
        form({ id: first.id, version: 0, kind: 'CANCEL', reason: 'Cancel the first visit' })
      )
    ).rejects.toThrow('/changes/')
    const change = await prisma.workshopChange.findFirstOrThrow()
    await expect(applyWorkshopChange(form({ id: change.id }))).rejects.toThrow('changed=1')
    await expect(assignPA(form({ id: second.id, version: 0, paId: f.pa.id }))).rejects.toThrow(
      'staffed=1'
    )
  })
  it('invalidates a matching preview after the day setting changes', async () => {
    await draft()
    await expect(previewMatching(form({ month: '2027-01', classId: f.cls.id }))).rejects.toThrow(
      '/match/'
    )
    const preview = await prisma.matchingPreview.findFirstOrThrow()
    await expect(saveGap(form({ minimumGapDays: 2 }))).rejects.toThrow('saved=1')
    await expect(applyMatching(form({ id: preview.id }))).rejects.toThrow('eligibility%20changed')
    expect(await prisma.assignment.count()).toBe(0)
  })
  it('rejects invalid day settings without mutating data and enforces database bounds', async () => {
    const before = await prisma.schedulingSettings.findUniqueOrThrow({ where: { id: 1 } })
    for (const minimumGapDays of ['', '0', '-1', '1.5', '366']) {
      await expect(saveGap(form({ minimumGapDays }))).rejects.toThrow('/admin/staffing?error=')
      expect(await prisma.schedulingSettings.findUniqueOrThrow({ where: { id: 1 } })).toEqual(
        before
      )
    }
    for (const minimumGapDays of [0, -1, 366])
      await expect(
        prisma.schedulingSettings.update({ where: { id: 1 }, data: { minimumGapDays } })
      ).rejects.toThrow()
  })
  it('defaults new and unconfigured settings to seven days while preserving configured values and workshops', async () => {
    const sql = await readFile(
      'prisma/migrations/20260917084135_direct_workshop_booking/migration.sql',
      'utf8'
    )
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'CREATE TEMP TABLE "SchedulingSettings" ("id" INTEGER PRIMARY KEY, "minimumGapDays" INTEGER, "revision" INTEGER DEFAULT 0) ON COMMIT DROP'
      )
      await tx.$executeRawUnsafe(
        'CREATE TEMP TABLE "Workshop" ("id" INTEGER PRIMARY KEY) ON COMMIT DROP'
      )
      await tx.$executeRawUnsafe('INSERT INTO "SchedulingSettings" VALUES (1,NULL,3),(2,2,4)')
      await tx.$executeRawUnsafe('INSERT INTO "Workshop" VALUES (1)')
      for (const statement of sql
        .replace(/^--.*$/gm, '')
        .split(';')
        .filter((part) => part.trim()))
        await tx.$executeRawUnsafe(statement)
      await tx.$executeRawUnsafe('INSERT INTO "SchedulingSettings" ("id") VALUES (3)')
      const rows = await tx.$queryRaw<
        { minimumGapDays: number; revision: number }[]
      >`SELECT "minimumGapDays", "revision" FROM "SchedulingSettings" ORDER BY "id"`
      expect(rows).toEqual([
        { minimumGapDays: 7, revision: 4 },
        { minimumGapDays: 2, revision: 4 },
        { minimumGapDays: 7, revision: 0 },
      ])
      expect(await tx.$queryRaw`SELECT * FROM "Workshop"`).toEqual([
        { id: 1, hostingConfirmed: false },
      ])
    })
  })
  it('backfills legacy minutes, preserves NULL and invalidates old previews without deleting data', async () => {
    const sql = await readFile(
      'prisma/migrations/20260916121045_calendar_day_assignment_gap/migration.sql',
      'utf8'
    )
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'CREATE TEMP TABLE "SchedulingSettings" ("id" INTEGER PRIMARY KEY, "minimumGapMinutes" INTEGER, "revision" INTEGER) ON COMMIT DROP'
      )
      await tx.$executeRawUnsafe(
        'INSERT INTO "SchedulingSettings" VALUES (1,NULL,7),(2,1,7),(3,60,7),(4,1440,7),(5,1441,7),(6,10080,7)'
      )
      for (const statement of sql
        .replace(/^--.*$/gm, '')
        .split(';')
        .filter((part) => part.trim()))
        await tx.$executeRawUnsafe(statement)
      const rows = await tx.$queryRaw<
        { minimumGapDays: number | null; minimumGapMinutes: number | null; revision: number }[]
      >`SELECT * FROM "SchedulingSettings" ORDER BY "id"`
      expect(rows.map((row) => row.minimumGapDays)).toEqual([null, 1, 1, 1, 2, 7])
      expect(rows.map((row) => row.minimumGapMinutes)).toEqual([null, 1, 60, 1440, 1441, 10080])
      expect(rows.every((row) => row.revision === 8)).toBe(true)
    })
  })
})
