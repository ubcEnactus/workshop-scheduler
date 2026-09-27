import { addCandidateFixture } from '../fixtures'
import { createSessionFixture } from '../fixtures'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../src/lib/db'
import { form, resetFixtures, staffingForm, workshopForm } from '../fixtures'
import { vancouverToUtc } from '../../src/lib/time'
import { loadSchedule } from '../../src/lib/scheduling/store'
import { scheduleHash } from '../../src/lib/scheduling/matching-preview'
const { sessionAuth } = vi.hoisted(() => ({ sessionAuth: vi.fn() }))
vi.mock('next-auth', () => ({ default: () => ({ auth: sessionAuth }) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error('REDIRECT:' + url)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
import {
  updateDraftStaffing,
  publishSelectedDrafts,
} from '../../src/app/admin/workshops/workspace-actions'
import { saveQuotas } from '../../src/app/admin/staffing/bulk-quota-actions'
import { createWorkshopForm, updateWorkshopForm } from '../../src/app/admin/workshops/actions'
import { createWorkshopBatchForm } from '../../src/app/admin/workshops/plan/actions'
import { saveAvailabilityForm } from '../../src/app/pa/availability/actions'
let f: Awaited<ReturnType<typeof resetFixtures>>
beforeEach(async () => {
  f = await resetFixtures()
  sessionAuth.mockResolvedValue({ user: { id: f.admin.id } })
})
afterAll(async () => {
  await prisma.$disconnect()
})
async function quotaForm(values: Record<string, string>) {
  const settings = await prisma.schedulingSettings.findUniqueOrThrow({ where: { id: 1 } })
  const data = form({ month: '2027-01', revision: settings.revision, schoolId: f.school.id })
  for (const [id, quota] of Object.entries(values)) {
    data.append('paId', id)
    data.append('quota', quota)
  }
  return data
}
async function draft(date = '2027-01-04', staffed = false) {
  return createSessionFixture({
    data: {
      classSectionId: f.cls.id,
      scheduledStart: vancouverToUtc(date, 600),
      scheduledEnd: vancouverToUtc(date, 660),
      minPAs: 1,
      maxPAs: 1,
      ...(staffed
        ? { assignments: { create: { paId: f.pa.id, status: 'DRAFT', source: 'MANUAL' } } }
        : {}),
    },
  })
}
async function ready() {
  await prisma.schedulingSettings.update({ where: { id: 1 }, data: { minimumGapDays: 1 } })
  await prisma.monthlyPAQuota.create({ data: { paId: f.pa.id, month: '2027-01', quota: 5 } })
  await prisma.availability.createMany({
    data: [600, 615, 630, 645].map((startMin) => ({ userId: f.pa.id, dayOfWeek: 0, startMin })),
  })
}
describe('faster workflow authorization and atomicity', () => {
  it('publishes one workshop across months and rejects neighboring sessions from another workshop', async () => {
    await ready()
    const first = await draft('2027-01-25', true)
    const second = await createSessionFixture({
      data: {
        classSectionId: f.sibling.id,
        scheduledStart: vancouverToUtc('2027-02-01', 600),
        scheduledEnd: vancouverToUtc('2027-02-01', 660),
        minPAs: 1,
        maxPAs: 1,
        assignments: { create: { paId: f.pa.id, status: 'DRAFT', source: 'MANUAL' } },
      },
    })
    await prisma.classWorkshop.updateMany({
      where: { id: { in: [first.classWorkshopId, second.classWorkshopId] } },
      data: { workshopDefinitionId: 'fixture-definition-1' },
    })
    const neighboring = await draft('2027-01-18', true)
    const scope = { workshopDefinitionId: 'fixture-definition-1' }
    const inputHash = scheduleHash(await loadSchedule(prisma, { kind: 'run', ...scope }))
    const rejected = await publishSelectedDrafts({
      scope,
      inputHash,
      entries: [{ id: neighboring.id, version: 0 }],
    })
    expect(rejected.error).toContain('outside this workshop')
    expect(await prisma.workshopEvent.count()).toBe(0)
    const result = await publishSelectedDrafts({
      scope,
      inputHash,
      entries: [first, second].map((session) => ({ id: session.id, version: 0 })),
    })
    expect(result.success).toContain('2 teacher sessions published')
    expect(
      (await prisma.workshopSession.findUniqueOrThrow({ where: { id: neighboring.id } })).status
    ).toBe('DRAFT')
    expect(await prisma.workshopSession.count({ where: { status: 'PUBLISHED' } })).toBe(2)
  })
  it.each(['PA', 'TEACHER'] as const)(
    'rejects %s before parsing any new admin mutation',
    async (role) => {
      sessionAuth.mockResolvedValue({ user: { id: role === 'PA' ? f.pa.id : f.teacher.id } })
      for (const action of [
        () => updateDraftStaffing(new FormData()),
        () => publishSelectedDrafts(null),
        () => saveQuotas({}, new FormData()),
        () => createWorkshopForm({}, new FormData()),
        () => updateWorkshopForm({}, new FormData()),
        () => createWorkshopBatchForm({}, new FormData()),
      ])
        await expect(action()).rejects.toThrow('REDIRECT:/403')
    }
  )
  it('bulk quotas keep zero distinct from blank and preserve context', async () => {
    await prisma.monthlyPAQuota.create({ data: { paId: f.pa.id, month: '2027-01', quota: 3 } })
    await expect(saveQuotas({}, await quotaForm({ [f.pa.id]: '0' }))).rejects.toThrow(
      'month=2027-01&schoolId=' + f.school.id
    )
    expect((await prisma.monthlyPAQuota.findFirstOrThrow()).quota).toBe(0)
    await expect(saveQuotas({}, await quotaForm({ [f.pa.id]: '' }))).rejects.toThrow('saved=1')
    expect(await prisma.monthlyPAQuota.count()).toBe(0)
  })
  it('bulk quota invalid rows roll back all rows, retaining field errors', async () => {
    const second = await prisma.user.create({ data: { email: 'ux-pa@fixture.local', role: 'PA' } })
    const result = await saveQuotas({}, await quotaForm({ [f.pa.id]: '4', [second.id]: '-1' }))
    expect(result.fields?.[second.id]).toBeTruthy()
    expect(await prisma.monthlyPAQuota.count()).toBe(0)
  })
  it('rejects duplicate, omitted, inactive and stale quota submissions', async () => {
    const stale = await quotaForm({ [f.pa.id]: '4' })
    const duplicate = await quotaForm({ [f.pa.id]: '4' })
    duplicate.append('paId', f.pa.id)
    duplicate.append('quota', '5')
    expect((await saveQuotas({}, duplicate)).error).toBeTruthy()
    expect((await saveQuotas({}, await quotaForm({}))).error).toContain('active PA list')
    await expect(saveQuotas({}, await quotaForm({ [f.pa.id]: '2' }))).rejects.toThrow('saved=1')
    expect((await saveQuotas({}, stale)).error).toContain('changed')
    expect((await prisma.monthlyPAQuota.findFirstOrThrow()).quota).toBe(2)
    const inactive = await quotaForm({ [f.pa.id]: '4' })
    await prisma.user.update({ where: { id: f.pa.id }, data: { deletedAt: new Date() } })
    expect((await saveQuotas({}, inactive)).error).toContain('active PA list')
  })
  it('in-place staffing permits missing availability while preserving version checks', async () => {
    const w = await draft()
    expect(
      (await updateDraftStaffing(await staffingForm(w.id, 0, f.pa.id, { operation: 'assign' })))
        .success
    ).toBeTruthy()
    expect(await prisma.assignment.findFirstOrThrow()).toMatchObject({
      overrideAvailability: true,
      overrideReason: null,
    })
    expect(
      (
        await updateDraftStaffing(
          form({ id: w.id, version: 0, paId: f.pa.id, operation: 'remove' })
        )
      ).error
    ).toContain('changed')
    expect(await prisma.assignment.count()).toBe(1)
    expect(
      (
        await updateDraftStaffing(
          form({ id: w.id, version: 1, paId: f.pa.id, operation: 'remove' })
        )
      ).success
    ).toBeTruthy()
    expect(await prisma.assignment.count()).toBe(0)
  })
  it('bulk publication validates every row before writing, then publishes atomically with history', async () => {
    await ready()
    const first = await draft('2027-01-04', true),
      second = await draft('2027-01-11')
    const entries = [first, second].map((w) => ({ id: w.id, version: w.version }))
    expect(
      (
        await publishSelectedDrafts({
          entries,
          inputHash: scheduleHash(await loadSchedule(prisma)),
        })
      ).error
    ).toContain('Minimum staffing')
    expect(await prisma.workshopSession.count({ where: { status: 'PUBLISHED' } })).toBe(0)
    expect(await prisma.workshopEvent.count()).toBe(0)
    await prisma.assignment.create({
      data: { workshopSessionId: second.id, paId: f.pa.id, status: 'DRAFT' },
    })
    expect(
      (
        await publishSelectedDrafts({
          entries,
          inputHash: scheduleHash(await loadSchedule(prisma)),
        })
      ).success
    ).toContain('2 teacher sessions published.')
    expect(await prisma.workshopSession.count({ where: { status: 'PUBLISHED' } })).toBe(2)
    expect(await prisma.workshopEvent.count({ where: { kind: 'PUBLISH' } })).toBe(2)
    expect(await prisma.assignment.count({ where: { status: 'PUBLISHED' } })).toBe(2)
  })
  it('rejects duplicate, stale and concurrent publication reviews without duplicate events', async () => {
    await ready()
    const w = await draft('2027-01-04', true)
    const entries = [{ id: w.id, version: 0 }],
      inputHash = scheduleHash(await loadSchedule(prisma))
    expect(
      (await publishSelectedDrafts({ entries: [...entries, ...entries], inputHash })).error
    ).toBeTruthy()
    await prisma.availability.deleteMany({ where: { userId: f.pa.id, startMin: 645 } })
    expect((await publishSelectedDrafts({ entries, inputHash })).error).toContain('changed')
    await prisma.availability.create({
      data: { userId: f.pa.id, dayOfWeek: 0, startMin: 645 },
    })
    const request = { entries, inputHash: scheduleHash(await loadSchedule(prisma)) }
    const results = await Promise.all([
      publishSelectedDrafts(request),
      publishSelectedDrafts(request),
    ])
    expect(results.filter((r) => r.success)).toHaveLength(1)
    expect(await prisma.workshopEvent.count()).toBe(1)
  })
  it('workshop form errors preserve field feedback and make no writes', async () => {
    const result = await createWorkshopForm({}, workshopForm(f.cls.id, { endTime: '09:00' }))
    expect(result.fields?.endTime).toBeTruthy()
    expect(await prisma.workshopSession.count()).toBe(0)
    await addCandidateFixture(f.cls.id, '2027-01-04')
    const invalid = await createWorkshopForm(
      {},
      workshopForm(f.cls.id, { startTime: '07:00', endTime: '08:00' })
    )
    expect(invalid.error).toContain('availability window')
  })
  it('batch form validates all choices before committing and retries the same request safely', async () => {
    await prisma.workshopDefinition.update({
      where: { id: 'fixture-definition-1' },
      data: {
        deliveryStartsOn: new Date('2027-01-04T00:00:00.000Z'),
        deliveryEndsOn: new Date('2027-01-29T00:00:00.000Z'),
      },
    })
    const key = randomUUID()
    const choices = await Promise.all(
      [f.cls, f.sibling].map((cls) => addCandidateFixture(cls.id, '2027-01-04'))
    )
    const data = form({
      requestKey: key,
      workshopDefinitionId: 'fixture-definition-1',
      expectedDefinitionRevision: 0,
      mode: 'IN_PERSON',
    })
    for (const [index, choice] of choices.entries()) {
      data.append('classWorkshopId', choice.classWorkshopId)
      data.append('date', '2027-01-04')
      data.append('startTime', index === 0 ? '10:00' : '07:00')
    }
    expect((await createWorkshopBatchForm({}, data)).error).toContain('availability window')
    expect(await prisma.workshopSession.count()).toBe(0)
    const valid = form({
      requestKey: key,
      workshopDefinitionId: 'fixture-definition-1',
      expectedDefinitionRevision: 0,
      classWorkshopId: choices[0].classWorkshopId,
      date: '2027-01-04',
      startTime: '10:00',
      mode: 'IN_PERSON',
    })
    expect(await createWorkshopBatchForm({}, valid)).toMatchObject({
      destination: expect.stringContaining('batch='),
    })
    expect(await createWorkshopBatchForm({}, valid)).toMatchObject({
      destination: expect.stringContaining('batch='),
    })
    expect(await prisma.workshopSession.count()).toBe(1)
  })
  it('stateful PA availability rejects admin access and invalid ranges without clearing data', async () => {
    await expect(saveAvailabilityForm({}, new FormData())).rejects.toThrow('/403')
    sessionAuth.mockResolvedValue({ user: { id: f.pa.id } })
    await prisma.availability.create({ data: { userId: f.pa.id, dayOfWeek: 0, startMin: 600 } })
    expect(
      (await saveAvailabilityForm({}, form({ slots: '0-901', effectiveFrom: '2027-01-01' }))).error
    ).toBeTruthy()
    expect(await prisma.availability.count()).toBe(1)
  })
})
