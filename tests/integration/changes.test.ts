import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../src/lib/db'
import { form, resetFixtures } from '../fixtures'
import { vancouverToUtc } from '../../src/lib/time'
import { loadSchedule } from '../../src/lib/scheduling/store'
import { eligibility, workload } from '../../src/lib/scheduling/eligibility'
import { visibleWorkshop } from '../../src/lib/scheduling/visibility'
const { sessionAuth } = vi.hoisted(() => ({ sessionAuth: vi.fn() }))
vi.mock('next-auth', () => ({ default: () => ({ auth: sessionAuth }) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error('REDIRECT:' + url)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
import {
  stageWorkshopChange,
  applyWorkshopChange,
} from '../../src/app/admin/workshops/changes/actions'
import { saveAvailability } from '../../src/app/pa/availability/actions'
let f: Awaited<ReturnType<typeof resetFixtures>>
beforeEach(async () => {
  f = await resetFixtures()
  sessionAuth.mockResolvedValue({ user: { id: f.admin.id } })
})
afterAll(async () => {
  await prisma.$disconnect()
})
async function ready(date = '2027-01-04') {
  await prisma.schedulingSettings.update({ where: { id: 1 }, data: { minimumGapMinutes: 60 } })
  const replacement = await prisma.user.create({
    data: { name: 'Replacement PA', email: 'replacement@fixture.local', role: 'PA' },
  })
  for (const paId of [f.pa.id, replacement.id]) {
    await prisma.monthlyPAQuota.createMany({
      data: ['2027-01', '2026-09'].map((month) => ({ paId, month, quota: 2 })),
    })
    await prisma.availability.createMany({
      data: [600, 630].map((startMin) => ({ userId: paId, dayOfWeek: 0, startMin })),
    })
  }
  const w = await prisma.workshop.create({
    data: {
      classSectionId: f.cls.id,
      scheduledStart: vancouverToUtc(date, 600),
      scheduledEnd: vancouverToUtc(date, 660),
      status: 'PUBLISHED',
      publishedAt: new Date(),
      locked: true,
      minPAs: 1,
      maxPAs: 2,
      assignments: { create: { paId: f.pa.id, status: 'PUBLISHED' } },
    },
  })
  return { w, replacement }
}
async function stage(values: Record<string, string | number>) {
  await expect(stageWorkshopChange(form({ reason: 'Test change', ...values }))).rejects.toThrow(
    'REDIRECT:/admin/workshops/changes/'
  )
  return prisma.workshopChange.findFirstOrThrow({ orderBy: { createdAt: 'desc' } })
}
describe('reviewed workshop changes', () => {
  it.each([stageWorkshopChange, applyWorkshopChange])(
    'authorizes before parsing',
    async (action) => {
      for (const user of [f.pa, f.teacher]) {
        sessionAuth.mockResolvedValue({ user: { id: user.id } })
        await expect(action(new FormData())).rejects.toThrow('/403')
      }
    }
  )
  it('keeps the old PA when a replacement is invalid, then records an atomic, repeatable change', async () => {
    const { w, replacement } = await ready()
    const p = await stage({
      id: w.id,
      version: 0,
      kind: 'REPLACE',
      oldPaId: f.pa.id,
      newPaId: replacement.id,
    })
    expect((await prisma.assignment.findFirstOrThrow()).paId).toBe(f.pa.id)
    await prisma.availability.deleteMany({ where: { userId: replacement.id } })
    await expect(applyWorkshopChange(form({ id: p.id }))).rejects.toThrow('Availability')
    expect((await prisma.assignment.findFirstOrThrow()).paId).toBe(f.pa.id)
    expect(await prisma.workshopEvent.count()).toBe(0)
    await prisma.availability.createMany({
      data: [600, 630].map((startMin) => ({ userId: replacement.id, dayOfWeek: 0, startMin })),
    })
    await Promise.allSettled([
      applyWorkshopChange(form({ id: p.id })),
      applyWorkshopChange(form({ id: p.id })),
    ])
    const assignment = await prisma.assignment.findFirstOrThrow()
    expect(assignment.paId).toBe(replacement.id)
    expect(assignment.status).toBe('PUBLISHED')
    expect(await prisma.workshopEvent.count()).toBe(1)
    const event = await prisma.workshopEvent.findFirstOrThrow()
    expect(event.actorId).toBe(f.admin.id)
    expect(event.actorName).toBe(f.admin.name)
    expect(event.affectedPAIds.sort()).toEqual([f.pa.id, replacement.id].sort())
    const s = await loadSchedule(prisma)
    expect(workload(s, f.pa.id, '2027-01')).toBe(0)
    expect(workload(s, replacement.id, '2027-01')).toBe(1)
  })
  it('revalidates every retained PA when moving across months and preserves dates on failure', async () => {
    const { w, replacement } = await ready()
    await prisma.assignment.create({
      data: { workshopId: w.id, paId: replacement.id, status: 'PUBLISHED' },
    })
    const data = {
      id: w.id,
      version: 0,
      kind: 'RESCHEDULE',
      date: '2027-02-01',
      startTime: '10:00',
      endTime: '11:00',
    }
    await expect(stageWorkshopChange(form({ ...data, reason: 'Move' }))).rejects.toThrow('quota')
    await prisma.monthlyPAQuota.createMany({
      data: [f.pa.id, replacement.id].map((paId) => ({ paId, month: '2027-02', quota: 1 })),
    })
    const p = await stage(data)
    expect(
      (await prisma.workshop.findUniqueOrThrow({ where: { id: w.id } })).scheduledStart
    ).toEqual(w.scheduledStart)
    await prisma.monthlyPAQuota.update({
      where: { paId_month: { paId: replacement.id, month: '2027-02' } },
      data: { quota: 0 },
    })
    await expect(applyWorkshopChange(form({ id: p.id }))).rejects.toThrow('quota')
    await prisma.monthlyPAQuota.update({
      where: { paId_month: { paId: replacement.id, month: '2027-02' } },
      data: { quota: 1 },
    })
    await expect(applyWorkshopChange(form({ id: p.id }))).rejects.toThrow('changed=1')
    const s = await loadSchedule(prisma)
    for (const paId of [f.pa.id, replacement.id]) {
      expect(workload(s, paId, '2027-01')).toBe(0)
      expect(workload(s, paId, '2027-02')).toBe(1)
    }
    expect(s.workshops[0].scheduledStart).toEqual(vancouverToUtc('2027-02-01', 600))
  })
  it('rechecks hosting blocks and teacher conflicts at apply', async () => {
    const { w } = await ready()
    const p = await stage({
      id: w.id,
      version: 0,
      kind: 'RESCHEDULE',
      date: '2027-01-11',
      startTime: '10:00',
      endTime: '11:00',
    })
    await prisma.workshop.create({
      data: {
        classSectionId: f.sibling.id,
        scheduledStart: vancouverToUtc('2027-01-11', 600),
        scheduledEnd: vancouverToUtc('2027-01-11', 660),
      },
    })
    await expect(applyWorkshopChange(form({ id: p.id }))).rejects.toThrow('overlapping')
    await prisma.classMeeting.deleteMany()
    await expect(applyWorkshopChange(form({ id: p.id }))).rejects.toThrow('hosting')
    expect(
      (await prisma.workshop.findUniqueOrThrow({ where: { id: w.id } })).scheduledStart
    ).toEqual(w.scheduledStart)
  })
  it('serializes competing published changes and rejects other administrators using a private review', async () => {
    const { w } = await ready()
    const a = await stage({ id: w.id, version: 0, kind: 'CANCEL' })
    const b = await stage({
      id: w.id,
      version: 0,
      kind: 'RESCHEDULE',
      date: '2027-01-11',
      startTime: '10:00',
      endTime: '11:00',
    })
    const other = await prisma.user.create({
      data: { role: 'ADMIN', email: 'admin2@fixture.local' },
    })
    sessionAuth.mockResolvedValue({ user: { id: other.id } })
    await expect(applyWorkshopChange(form({ id: a.id }))).rejects.toThrow('unavailable')
    sessionAuth.mockResolvedValue({ user: { id: f.admin.id } })
    await Promise.allSettled([
      applyWorkshopChange(form({ id: a.id })),
      applyWorkshopChange(form({ id: b.id })),
    ])
    expect(await prisma.workshopEvent.count()).toBe(1)
    expect((await prisma.workshop.findUniqueOrThrow({ where: { id: w.id } })).version).toBe(1)
  })
  it('retains published cancellation history, hides draft cancellations and frees quota', async () => {
    const { w } = await ready()
    const p = await stage({ id: w.id, version: 0, kind: 'CANCEL' })
    await expect(applyWorkshopChange(form({ id: p.id }))).rejects.toThrow('changed=1')
    const draft = await prisma.workshop.create({
      data: {
        classSectionId: f.sibling.id,
        scheduledStart: vancouverToUtc('2027-01-11', 600),
        scheduledEnd: vancouverToUtc('2027-01-11', 660),
      },
    })
    const d = await stage({ id: draft.id, version: 0, kind: 'CANCEL' })
    await expect(applyWorkshopChange(form({ id: d.id }))).rejects.toThrow('changed=1')
    expect(await prisma.workshop.count({ where: visibleWorkshop })).toBe(1)
    expect(await prisma.assignment.count({ where: { status: 'PUBLISHED' } })).toBe(1)
    expect(workload(await loadSchedule(prisma), f.pa.id, '2027-01')).toBe(0)
    await expect(
      stageWorkshopChange(form({ id: w.id, version: 1, kind: 'CANCEL', reason: 'Again' }))
    ).rejects.toThrow('Only%20draft')
  })
  it('records completion only after a published workshop ends and counts its workload', async () => {
    const { w } = await ready('2026-09-07')
    const p = await stage({ id: w.id, version: 0, kind: 'COMPLETE' })
    await expect(applyWorkshopChange(form({ id: p.id }))).rejects.toThrow('changed=1')
    expect((await prisma.workshop.findUniqueOrThrow({ where: { id: w.id } })).status).toBe(
      'COMPLETED'
    )
    expect(workload(await loadSchedule(prisma), f.pa.id, '2026-09')).toBe(1)
    const future = await prisma.workshop.create({
      data: {
        classSectionId: f.cls.id,
        status: 'PUBLISHED',
        scheduledStart: vancouverToUtc('2027-01-04', 600),
        scheduledEnd: vancouverToUtc('2027-01-04', 660),
      },
    })
    await expect(
      stageWorkshopChange(form({ id: future.id, version: 0, kind: 'COMPLETE', reason: 'Done' }))
    ).rejects.toThrow('has%20ended')
  })
  it('flags an availability edit without unassigning or changing published information', async () => {
    const { w } = await ready()
    sessionAuth.mockResolvedValue({ user: { id: f.pa.id } })
    await expect(saveAvailability(new FormData())).rejects.toThrow('saved=1')
    const s = await loadSchedule(prisma),
      scheduled = s.workshops.find((x) => x.id === w.id)!
    expect(eligibility(s, scheduled, f.pa.id)).toContain('Availability is missing.')
    expect(scheduled.status).toBe('PUBLISHED')
    expect(scheduled.version).toBe(0)
    expect(scheduled.assignments.map((a) => a.paId)).toEqual([f.pa.id])
  })
})
