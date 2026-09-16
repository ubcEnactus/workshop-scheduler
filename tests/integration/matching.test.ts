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
import { previewMatching, applyMatching } from '../../src/app/admin/workshops/match/actions'
import { saveQuota } from '../../src/app/admin/staffing/actions'
let f: Awaited<ReturnType<typeof resetFixtures>>
beforeEach(async () => {
  f = await resetFixtures()
  sessionAuth.mockResolvedValue({ user: { id: f.admin.id } })
})
afterAll(async () => {
  await prisma.$disconnect()
})
async function ready() {
  await prisma.schedulingSettings.update({ where: { id: 1 }, data: { minimumGapDays: 1 } })
  await prisma.monthlyPAQuota.create({ data: { paId: f.pa.id, month: '2027-01', quota: 2 } })
  await prisma.availability.createMany({
    data: [600, 630].map((startMin) => ({ userId: f.pa.id, dayOfWeek: 0, startMin })),
  })
  return prisma.workshop.create({
    data: {
      classSectionId: f.cls.id,
      scheduledStart: vancouverToUtc('2027-01-04', 600),
      scheduledEnd: vancouverToUtc('2027-01-04', 660),
      maxPAs: 1,
    },
  })
}
async function preview() {
  await expect(previewMatching(form({ month: '2027-01', classId: f.cls.id }))).rejects.toThrow(
    'REDIRECT:/admin/workshops/match/'
  )
  return prisma.matchingPreview.findFirstOrThrow({ orderBy: { createdAt: 'desc' } })
}
describe('matching previews', () => {
  it.each([previewMatching, applyMatching])('authorizes before parsing', async (action) => {
    sessionAuth.mockResolvedValue({ user: { id: f.pa.id } })
    await expect(action(new FormData())).rejects.toThrow('/403')
  })
  it('previews without writes, applies once, and reruns without duplicate workload or changed dates', async () => {
    const w = await ready(),
      p = await preview()
    expect(await prisma.assignment.count()).toBe(0)
    await Promise.allSettled([applyMatching(form({ id: p.id })), applyMatching(form({ id: p.id }))])
    expect(await prisma.assignment.count()).toBe(1)
    const assignment = await prisma.assignment.findFirstOrThrow()
    expect(assignment.source).toBe('AUTOMATIC')
    const p2 = await preview()
    await expect(applyMatching(form({ id: p2.id }))).rejects.toThrow('matched=1')
    expect((await prisma.assignment.findFirstOrThrow()).id).toBe(assignment.id)
    expect(
      (await prisma.workshop.findUniqueOrThrow({ where: { id: w.id } })).scheduledStart
    ).toEqual(w.scheduledStart)
  })
  it('rejects stale and expired previews and previews owned by another admin', async () => {
    await ready()
    const p = await preview()
    await expect(saveQuota(form({ paId: f.pa.id, month: '2027-01', quota: 0 }))).rejects.toThrow(
      'saved=1'
    )
    await expect(applyMatching(form({ id: p.id }))).rejects.toThrow('changed')
    const p2 = await preview()
    await prisma.matchingPreview.update({ where: { id: p2.id }, data: { expiresAt: new Date(0) } })
    await expect(applyMatching(form({ id: p2.id }))).rejects.toThrow('expired')
    const other = await prisma.user.create({
      data: { role: 'ADMIN', email: 'other-admin@fixture.local' },
    })
    sessionAuth.mockResolvedValue({ user: { id: other.id } })
    await expect(applyMatching(form({ id: p.id }))).rejects.toThrow('unavailable')
    expect(await prisma.assignment.count()).toBe(0)
  })
  it('serializes competing previews and protects manual changes', async () => {
    const w = await ready(),
      a = await preview(),
      b = await preview()
    const results = await Promise.allSettled([
      applyMatching(form({ id: a.id })),
      applyMatching(form({ id: b.id })),
    ])
    expect(
      results.filter((r) => r.status === 'rejected' && String(r.reason).includes('changed'))
    ).toHaveLength(1)
    await prisma.assignment.updateMany({ data: { source: 'MANUAL' } })
    await prisma.workshop.update({ where: { id: w.id }, data: { locked: true } })
    const p = await preview()
    await expect(applyMatching(form({ id: p.id }))).rejects.toThrow('matched=1')
    expect((await prisma.assignment.findFirstOrThrow()).source).toBe('MANUAL')
  })
})
