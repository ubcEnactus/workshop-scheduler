import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../src/lib/db'
import { form, resetFixtures } from '../fixtures'
import { vancouverToUtc } from '../../src/lib/time'
import { eligibility } from '../../src/lib/scheduling/eligibility'
import { loadSchedule } from '../../src/lib/scheduling/store'
const { sessionAuth } = vi.hoisted(() => ({ sessionAuth: vi.fn() }))
vi.mock('next-auth', () => ({ default: () => ({ auth: sessionAuth }) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error('REDIRECT:' + url)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
import * as actions from '../../src/app/admin/staffing/actions'
let fixtures: Awaited<ReturnType<typeof resetFixtures>>
beforeEach(async () => {
  fixtures = await resetFixtures()
  sessionAuth.mockResolvedValue({ user: { id: fixtures.admin.id } })
})
afterAll(async () => {
  await prisma.$disconnect()
})
async function ready() {
  await prisma.schedulingSettings.update({ where: { id: 1 }, data: { minimumGapMinutes: 60 } })
  await prisma.monthlyPAQuota.create({ data: { paId: fixtures.pa.id, month: '2027-01', quota: 2 } })
  await prisma.availability.createMany({
    data: Array.from({ length: 12 }, (_, i) => ({
      userId: fixtures.pa.id,
      dayOfWeek: 0,
      startMin: 540 + i * 30,
    })),
  })
}
async function draft(classSectionId = fixtures.cls.id, date = '2027-01-04') {
  return prisma.workshop.create({
    data: {
      classSectionId,
      scheduledStart: vancouverToUtc(date, 600),
      scheduledEnd: vancouverToUtc(date, 660),
      minPAs: 1,
      maxPAs: 1,
    },
  })
}
describe('manual staffing and publication', () => {
  it.each(Object.entries(actions))('%s authorizes before parsing input', async (_name, action) => {
    sessionAuth.mockResolvedValue({ user: { id: fixtures.pa.id } })
    await expect(action(new FormData())).rejects.toThrow('REDIRECT:/403')
  })
  it('requires quota, positive gap and availability, then saves a protected manual assignment', async () => {
    const w = await draft()
    await expect(
      actions.assignPA(form({ id: w.id, version: 0, paId: fixtures.pa.id }))
    ).rejects.toThrow('quota%20is%20missing')
    expect(await prisma.assignment.count()).toBe(0)
    await ready()
    await expect(
      actions.assignPA(form({ id: w.id, version: 0, paId: fixtures.pa.id }))
    ).rejects.toThrow('staffed=1')
    const saved = await prisma.workshop.findUniqueOrThrow({
      where: { id: w.id },
      include: { assignments: true },
    })
    expect(saved.locked).toBe(true)
    expect(saved.version).toBe(1)
    expect(saved.assignments[0].source).toBe('MANUAL')
    await expect(
      actions.removePA(form({ id: w.id, version: 1, paId: fixtures.pa.id }))
    ).rejects.toThrow('staffed=1')
    expect(await prisma.assignment.count()).toBe(0)
  })
  it('publishes atomically only after rechecking staffing and the current version', async () => {
    await ready()
    const w = await draft()
    await expect(actions.publishWorkshop(form({ id: w.id, version: 0 }))).rejects.toThrow(
      'Minimum%20staffing'
    )
    await expect(
      actions.assignPA(form({ id: w.id, version: 0, paId: fixtures.pa.id }))
    ).rejects.toThrow('staffed=1')
    await expect(actions.publishWorkshop(form({ id: w.id, version: 0 }))).rejects.toThrow(
      'workshop%20changed'
    )
    await prisma.availability.deleteMany()
    await expect(actions.publishWorkshop(form({ id: w.id, version: 1 }))).rejects.toThrow(
      'Availability'
    )
    expect((await prisma.assignment.findFirstOrThrow()).status).toBe('DRAFT')
    await prisma.availability.createMany({
      data: [600, 630].map((startMin) => ({ userId: fixtures.pa.id, dayOfWeek: 0, startMin })),
    })
    await expect(actions.publishWorkshop(form({ id: w.id, version: 1 }))).rejects.toThrow(
      'published=1'
    )
    expect((await prisma.assignment.findFirstOrThrow()).status).toBe('PUBLISHED')
    expect((await prisma.workshop.findUniqueOrThrow({ where: { id: w.id } })).status).toBe(
      'PUBLISHED'
    )
    await expect(
      actions.setWorkshopLock(form({ id: w.id, version: 2, locked: 'false' }))
    ).rejects.toThrow('always%20protected')
  })
  it('serializes two administrators assigning the same PA to overlapping workshops', async () => {
    await ready()
    const other = await prisma.classSection.create({
      data: {
        name: 'Other class',
        teacherId: fixtures.otherTeacher.id,
        schoolId: fixtures.otherSchool.id,
      },
    })
    const a = await draft(),
      b = await draft(other.id)
    await Promise.allSettled([
      actions.assignPA(form({ id: a.id, version: 0, paId: fixtures.pa.id })),
      actions.assignPA(form({ id: b.id, version: 0, paId: fixtures.pa.id })),
    ])
    expect(await prisma.assignment.count()).toBe(1)
  })
  it('retains existing work and flags it when a quota is lowered', async () => {
    await ready()
    const w = await draft()
    await expect(
      actions.assignPA(form({ id: w.id, version: 0, paId: fixtures.pa.id }))
    ).rejects.toThrow('staffed=1')
    await expect(
      actions.saveQuota(form({ paId: fixtures.pa.id, month: '2027-01', quota: 0 }))
    ).rejects.toThrow('saved=1')
    const s = await loadSchedule(prisma)
    expect(eligibility(s, s.workshops[0], fixtures.pa.id)).toContain('Monthly quota reached.')
    expect(await prisma.assignment.count()).toBe(1)
  })
  it('does not publish after a hosting block has been removed', async () => {
    await ready()
    const w = await draft()
    await expect(
      actions.assignPA(form({ id: w.id, version: 0, paId: fixtures.pa.id }))
    ).rejects.toThrow('staffed=1')
    await prisma.classMeeting.deleteMany()
    await expect(actions.publishWorkshop(form({ id: w.id, version: 1 }))).rejects.toThrow(
      'hosting%20block'
    )
  })
})
