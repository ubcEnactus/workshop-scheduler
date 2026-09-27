import { createSessionFixture } from '../fixtures'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../src/lib/db'
import { form, resetFixtures, staffingForm } from '../fixtures'
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
  await prisma.schedulingSettings.update({ where: { id: 1 }, data: { minimumGapDays: 1 } })
  await prisma.availability.createMany({
    data: Array.from({ length: 24 }, (_, i) => ({
      userId: fixtures.pa.id,
      dayOfWeek: 0,
      startMin: 540 + i * 15,
    })),
  })
}
async function draft(classSectionId = fixtures.cls.id, date = '2027-01-04') {
  return createSessionFixture({
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
  it('records a protected manual assignment with no monthly quota or unnecessary availability exception', async () => {
    const w = await draft()
    await ready()
    await expect(actions.assignPA(await staffingForm(w.id, 0, fixtures.pa.id))).rejects.toThrow(
      'staffed=1'
    )
    const saved = await prisma.workshopSession.findUniqueOrThrow({
      where: { id: w.id },
      include: { assignments: true },
    })
    expect(saved.locked).toBe(false)
    expect(saved.version).toBe(1)
    expect(saved.assignments[0].source).toBe('MANUAL')
    expect(saved.assignments[0].overrideAvailability).toBe(false)
    await expect(
      actions.removePA(form({ id: w.id, version: 1, paId: fixtures.pa.id }))
    ).rejects.toThrow('staffed=1')
    expect(await prisma.assignment.count()).toBe(0)
  })
  it.each(['missing', 'partial'])(
    'assigns and publishes despite %s availability with no additional confirmation',
    async (kind) => {
      const w = await draft()
      if (kind === 'partial') {
        await prisma.availability.create({
          data: { userId: fixtures.pa.id, dayOfWeek: 0, startMin: 600 },
        })
      }
      await expect(actions.assignPA(await staffingForm(w.id, 0, fixtures.pa.id))).rejects.toThrow(
        'staffed=1'
      )
      expect(await prisma.assignment.findFirstOrThrow()).toMatchObject({
        paId: fixtures.pa.id,
        source: 'MANUAL',
        overrideAvailability: true,
        overrideSameDay: false,
        overrideWeek: false,
        overrideReason: null,
      })
      const snapshot = await loadSchedule(prisma)
      const session = snapshot.workshops.find((item) => item.id === w.id)!
      expect(session.assignments[0].overrideAvailability).toBe(true)
      expect(eligibility(snapshot, session, fixtures.pa.id)).toEqual([])
      await expect(actions.publishWorkshop(form({ id: w.id, version: 1 }))).rejects.toThrow(
        'published=1'
      )
      expect(await prisma.assignment.findFirstOrThrow()).toMatchObject({
        status: 'PUBLISHED',
        overrideAvailability: true,
      })
    }
  )

  it('requires a fresh review when availability disappears after the Assign button was rendered', async () => {
    await ready()
    const w = await draft()
    const stale = await staffingForm(w.id, 0, fixtures.pa.id)
    await prisma.availability.deleteMany({ where: { userId: fixtures.pa.id } })
    await expect(actions.assignPA(stale)).rejects.toThrow('changed')
    expect(await prisma.assignment.count()).toBe(0)
    await expect(actions.assignPA(await staffingForm(w.id, 0, fixtures.pa.id))).rejects.toThrow(
      'staffed=1'
    )
    expect((await prisma.assignment.findFirstOrThrow()).overrideAvailability).toBe(true)
  })

  it.each([
    { date: '2027-01-04', sameDay: true, availability: 'full' },
    { date: '2027-01-05', sameDay: false, availability: 'full' },
    { date: '2027-01-04', sameDay: true, availability: 'missing' },
    { date: '2027-01-05', sameDay: false, availability: 'missing' },
  ])(
    'assigns and publishes with workload warnings on $date and $availability availability without confirmation or reason',
    async ({ date, sameDay, availability }) => {
      if (availability === 'full') {
        await ready()
        await prisma.availability.createMany({
          data: [600, 615, 630, 645].map((startMin) => ({
            userId: fixtures.pa.id,
            dayOfWeek: 1,
            startMin,
          })),
        })
      }
      const other = await prisma.classSection.create({
        data: {
          name: 'Existing workload',
          teacherId: fixtures.otherTeacher.id,
          schoolId: fixtures.otherSchool.id,
        },
      })
      const existing = await createSessionFixture({
        data: {
          classSectionId: other.id,
          scheduledStart: vancouverToUtc('2027-01-04', 720),
          scheduledEnd: vancouverToUtc('2027-01-04', 780),
          assignments: { create: { paId: fixtures.pa.id, source: 'MANUAL' } },
        },
      })
      const w = await draft(fixtures.cls.id, date)
      await expect(actions.assignPA(await staffingForm(w.id, 0, fixtures.pa.id))).rejects.toThrow(
        'staffed=1'
      )
      expect(
        await prisma.assignment.findFirstOrThrow({ where: { workshopSessionId: w.id } })
      ).toMatchObject({
        source: 'MANUAL',
        overrideSameDay: sameDay,
        overrideWeek: true,
        overrideAvailability: availability === 'missing',
        overrideReason: null,
      })
      await expect(actions.publishWorkshop(form({ id: w.id, version: 1 }))).rejects.toThrow(
        'published=1'
      )
      expect(
        await prisma.assignment.findFirstOrThrow({ where: { workshopSessionId: w.id } })
      ).toMatchObject({ status: 'PUBLISHED', overrideWeek: true })
      expect(
        await prisma.assignment.findFirstOrThrow({ where: { workshopSessionId: existing.id } })
      ).toMatchObject({ overrideSameDay: false, overrideWeek: false })
    }
  )

  it('rejects stale workload context even though a fresh choice would require no extra confirmation', async () => {
    await ready()
    const w = await draft()
    const stale = await staffingForm(w.id, 0, fixtures.pa.id)
    await createSessionFixture({
      data: {
        classSectionId: fixtures.sibling.id,
        scheduledStart: vancouverToUtc('2027-01-05', 600),
        scheduledEnd: vancouverToUtc('2027-01-05', 660),
        assignments: { create: { paId: fixtures.pa.id, source: 'MANUAL' } },
      },
    })
    await expect(actions.assignPA(stale)).rejects.toThrow('changed')
    expect(await prisma.assignment.count({ where: { workshopSessionId: w.id } })).toBe(0)
    await expect(actions.assignPA(await staffingForm(w.id, 0, fixtures.pa.id))).rejects.toThrow(
      'staffed=1'
    )
    expect(
      await prisma.assignment.findFirstOrThrow({ where: { workshopSessionId: w.id } })
    ).toMatchObject({ overrideWeek: true, overrideReason: null })
  })

  it('does not use an availability warning to bypass an inactive PA or full session', async () => {
    const w = await draft()
    await expect(
      actions.assignPA(await staffingForm(w.id, 0, fixtures.deleted.id))
    ).rejects.toThrow('inactive')
    expect(await prisma.assignment.count()).toBe(0)
    await expect(actions.assignPA(await staffingForm(w.id, 0, fixtures.pa.id))).rejects.toThrow(
      'staffed=1'
    )
    const extra = await prisma.user.create({ data: { role: 'PA', email: 'extra@fixture.local' } })
    await expect(actions.assignPA(await staffingForm(w.id, 1, extra.id))).rejects.toThrow(
      'capacity'
    )
    expect(await prisma.assignment.count()).toBe(1)
  })
  it('publishes atomically only after rechecking staffing and the current version', async () => {
    await ready()
    const w = await draft()
    await expect(actions.publishWorkshop(form({ id: w.id, version: 0 }))).rejects.toThrow(
      'Minimum%20staffing'
    )
    await expect(actions.assignPA(await staffingForm(w.id, 0, fixtures.pa.id))).rejects.toThrow(
      'staffed=1'
    )
    await expect(actions.publishWorkshop(form({ id: w.id, version: 0 }))).rejects.toThrow(
      'workshop%20changed'
    )
    await prisma.availability.deleteMany()
    await expect(actions.publishWorkshop(form({ id: w.id, version: 1 }))).rejects.toThrow(
      'Availability'
    )
    expect((await prisma.assignment.findFirstOrThrow()).status).toBe('DRAFT')
    await prisma.availability.createMany({
      data: [600, 615, 630, 645].map((startMin) => ({
        userId: fixtures.pa.id,
        dayOfWeek: 0,
        startMin,
      })),
    })
    await expect(actions.publishWorkshop(form({ id: w.id, version: 1 }))).rejects.toThrow(
      'published=1'
    )
    expect((await prisma.assignment.findFirstOrThrow()).status).toBe('PUBLISHED')
    expect((await prisma.workshopSession.findUniqueOrThrow({ where: { id: w.id } })).status).toBe(
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
    const [aForm, bForm] = await Promise.all([
      staffingForm(a.id, 0, fixtures.pa.id),
      staffingForm(b.id, 0, fixtures.pa.id),
    ])
    await Promise.allSettled([actions.assignPA(aForm), actions.assignPA(bForm)])
    expect(await prisma.assignment.count()).toBe(1)
  })
  it('retains existing work and ignores legacy monthly quotas for eligibility', async () => {
    await ready()
    const w = await draft()
    await expect(actions.assignPA(await staffingForm(w.id, 0, fixtures.pa.id))).rejects.toThrow(
      'staffed=1'
    )
    await expect(
      actions.saveQuota(form({ paId: fixtures.pa.id, month: '2027-01', quota: 0 }))
    ).rejects.toThrow('saved=1')
    const s = await loadSchedule(prisma)
    expect(eligibility(s, s.workshops[0], fixtures.pa.id)).not.toContain('quota')
    expect(await prisma.assignment.count()).toBe(1)
  })
  it('does not publish after its PA availability has been removed', async () => {
    await ready()
    const w = await draft()
    await expect(actions.assignPA(await staffingForm(w.id, 0, fixtures.pa.id))).rejects.toThrow(
      'staffed=1'
    )
    await prisma.availability.deleteMany({ where: { userId: fixtures.pa.id } })
    await expect(actions.publishWorkshop(form({ id: w.id, version: 1 }))).rejects.toThrow(
      'Availability'
    )
  })
})
