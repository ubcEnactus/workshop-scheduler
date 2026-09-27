import { addSessionCandidateFixture } from '../fixtures'
import { createSessionFixture } from '../fixtures'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../src/lib/db'
import { form, resetFixtures } from '../fixtures'
import { vancouverToUtc } from '../../src/lib/time'
import * as store from '../../src/lib/scheduling/store'
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
import { markWorkshopCommunicated } from '../../src/app/admin/workshops/communication-actions'
import { needsCommunication } from '../../src/lib/scheduling/communication'
const loadSchedule = store.loadSchedule
let f: Awaited<ReturnType<typeof resetFixtures>>
beforeEach(async () => {
  f = await resetFixtures()
  sessionAuth.mockResolvedValue({ user: { id: f.admin.id } })
})
afterAll(async () => {
  await prisma.$disconnect()
})
async function ready(date = '2027-01-04') {
  await prisma.schedulingSettings.update({ where: { id: 1 }, data: { minimumGapDays: 1 } })
  const replacement = await prisma.user.create({
    data: { name: 'Replacement PA', email: 'replacement@fixture.local', role: 'PA' },
  })
  for (const paId of [f.pa.id, replacement.id]) {
    await prisma.monthlyPAQuota.createMany({
      data: ['2027-01', '2026-09'].map((month) => ({ paId, month, quota: 2 })),
    })
    await prisma.availability.createMany({
      data: [600, 615, 630, 645].map((startMin) => ({ userId: paId, dayOfWeek: 0, startMin })),
    })
  }
  const w = await createSessionFixture({
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
async function editSession(
  id: string,
  version: number,
  paIds: string[],
  overrides: Record<string, string | number> = {}
) {
  const data = form({
    id,
    version,
    kind: 'EDIT',
    date: '2027-01-04',
    startTime: '10:00',
    endTime: '11:00',
    minPAs: 1,
    maxPAs: 2,
    mode: 'IN_PERSON',
    location: 'Room 203',
    notes: 'Private admin context',
    participantInstructions: 'Check in at the office.',
    reason: 'Teacher and PA confirmed the update.',
    ...overrides,
  })
  for (const paId of paIds) data.append('paIds', paId)
  await expect(stageWorkshopChange(data)).rejects.toThrow('REDIRECT:/admin/workshops/changes/')
  return prisma.workshopChange.findFirstOrThrow({ orderBy: { createdAt: 'desc' } })
}
describe('reviewed workshop changes', () => {
  it('applies a published edit when equivalent grouped assignment totals arrive in another order', async () => {
    const { w, replacement } = await ready()
    await createSessionFixture({
      data: {
        classSectionId: f.sibling.id,
        scheduledStart: vancouverToUtc('2027-01-11', 600),
        scheduledEnd: vancouverToUtc('2027-01-11', 660),
        assignments: { create: { paId: replacement.id } },
      },
    })
    let reverseGroups = false
    const observedOrders: string[][] = []
    // Keep the real transaction and query, altering only SQL's unspecified group order.
    const spy = vi.spyOn(store, 'loadSchedule').mockImplementation((db, scope) => {
      const assignment = new Proxy(db.assignment, {
        get(target, property, receiver) {
          if (property === 'groupBy')
            return async (args: {
              by: ['paId']
              where: Prisma.AssignmentWhereInput
              _count: { _all: true }
            }) => {
              const rows = await target.groupBy(args)
              rows.sort((a, b) => a.paId.localeCompare(b.paId))
              if (reverseGroups) rows.reverse()
              observedOrders.push(rows.map((row) => row.paId))
              return rows
            }
          return Reflect.get(target, property, receiver)
        },
      })
      const wrapped = new Proxy(db, {
        get(target, property, receiver) {
          return property === 'assignment' ? assignment : Reflect.get(target, property, receiver)
        },
      })
      return loadSchedule(wrapped, scope)
    })
    try {
      const change = await editSession(w.id, 0, [f.pa.id], { notes: 'Updated internal note' })
      expect(observedOrders.at(-1)).toHaveLength(2)
      const stagedOrder = [...observedOrders.at(-1)!]
      reverseGroups = true
      await expect(applyWorkshopChange(form({ id: change.id }))).rejects.toThrow('changed=1')
      expect(observedOrders.at(-1)).toEqual(stagedOrder.reverse())
      expect(await prisma.workshopSession.findUniqueOrThrow({ where: { id: w.id } })).toMatchObject(
        {
          version: 1,
          status: 'PUBLISHED',
          notes: 'Updated internal note',
        }
      )
      expect(await prisma.workshopEvent.count()).toBe(1)
    } finally {
      spy.mockRestore()
    }
  })

  it.each([
    { kind: 'RESCHEDULE', locked: false },
    { kind: 'RESCHEDULE', locked: true },
    { kind: 'REPLACE', locked: false },
    { kind: 'REPLACE', locked: true },
    { kind: 'EDIT', locked: false },
    { kind: 'EDIT', locked: true },
  ] as const)(
    'preserves draft auto-fill control during $kind (locked=$locked) and excludes only removed PAs',
    async ({ kind, locked }) => {
      const { w, replacement } = await ready()
      await prisma.workshopSession.update({
        where: { id: w.id },
        data: { status: 'DRAFT', publishedAt: null, locked },
      })
      await prisma.assignment.updateMany({
        where: { workshopSessionId: w.id },
        data: { status: 'DRAFT', source: 'AUTOMATIC' },
      })
      const original = await prisma.assignment.findFirstOrThrow({
        where: { workshopSessionId: w.id },
      })
      await addSessionCandidateFixture(w.id, '2027-01-11')
      await prisma.autoFillExclusion.create({
        data: { workshopSessionId: w.id, paId: replacement.id },
      })
      const change =
        kind === 'RESCHEDULE'
          ? await stage({
              id: w.id,
              version: 0,
              kind,
              date: '2027-01-11',
              startTime: '10:00',
              endTime: '11:00',
            })
          : kind === 'REPLACE'
            ? await stage({ id: w.id, version: 0, kind, oldPaId: f.pa.id, newPaId: replacement.id })
            : await editSession(w.id, 0, [replacement.id])
      await expect(applyWorkshopChange(form({ id: change.id }))).rejects.toThrow('changed=1')
      const saved = await prisma.workshopSession.findUniqueOrThrow({
        where: { id: w.id },
        include: { assignments: true, autoFillExclusions: true },
      })
      expect(saved).toMatchObject({ status: 'DRAFT', locked, publishedAt: null, version: 1 })
      if (kind === 'RESCHEDULE') {
        expect(saved.assignments[0]).toEqual(original)
        expect(saved.scheduledStart).toEqual(vancouverToUtc('2027-01-11', 600))
        expect(saved.autoFillExclusions.map((item) => item.paId)).toEqual([replacement.id])
      } else {
        expect(saved.assignments.map((item) => item.paId)).toEqual([replacement.id])
        expect(saved.autoFillExclusions.map((item) => item.paId)).toEqual([f.pa.id])
      }
      expect(await prisma.workshopSession.count({ where: visibleWorkshop })).toBe(0)
      expect(await prisma.workshopEvent.findFirstOrThrow()).toMatchObject({ wasPublished: false })
    }
  )

  it.each([
    { kind: 'REPLACE', date: '2027-01-04', sameDay: true },
    { kind: 'REPLACE', date: '2027-01-05', sameDay: false },
    { kind: 'EDIT', date: '2027-01-04', sameDay: true },
    { kind: 'EDIT', date: '2027-01-05', sameDay: false },
  ] as const)(
    'records workload warnings for published $kind without an extra confirmation ($date)',
    async ({ kind, date, sameDay }) => {
      const { w, replacement } = await ready()
      const other = await prisma.classSection.create({
        data: {
          name: 'Existing PA commitment',
          teacherId: f.otherTeacher.id,
          schoolId: f.otherSchool.id,
        },
      })
      await createSessionFixture({
        data: {
          classSectionId: other.id,
          scheduledStart: vancouverToUtc(date, 720),
          scheduledEnd: vancouverToUtc(date, 780),
          assignments: { create: { paId: replacement.id, source: 'MANUAL' } },
        },
      })
      const change =
        kind === 'REPLACE'
          ? await stage({ id: w.id, version: 0, kind, oldPaId: f.pa.id, newPaId: replacement.id })
          : await editSession(w.id, 0, [replacement.id])
      const reason = kind === 'REPLACE' ? 'Test change' : 'Teacher and PA confirmed the update.'
      expect(change.proposed).toMatchObject({
        workloadOverrides: [{ paId: replacement.id, sameDay, week: true, reason }],
      })
      await expect(applyWorkshopChange(form({ id: change.id }))).rejects.toThrow('changed=1')
      expect(
        await prisma.assignment.findFirstOrThrow({ where: { workshopSessionId: w.id } })
      ).toMatchObject({
        paId: replacement.id,
        status: 'PUBLISHED',
        source: 'MANUAL',
        overrideSameDay: sameDay,
        overrideWeek: true,
        overrideReason: reason,
      })
    }
  )

  it.each([
    { kind: 'REPLACE', availability: 'missing' },
    { kind: 'REPLACE', availability: 'partial' },
    { kind: 'EDIT', availability: 'missing' },
    { kind: 'EDIT', availability: 'partial' },
  ] as const)(
    'allows $kind with $availability availability and retains the exception on a later detail edit',
    async ({ kind, availability }) => {
      const { w, replacement } = await ready()
      await prisma.availability.deleteMany({
        where: { userId: replacement.id, ...(availability === 'partial' ? { startMin: 645 } : {}) },
      })
      const change =
        kind === 'REPLACE'
          ? await stage({ id: w.id, version: 0, kind, oldPaId: f.pa.id, newPaId: replacement.id })
          : await editSession(w.id, 0, [replacement.id])
      expect(change.proposed).toMatchObject({ availabilityOverrides: [{ paId: replacement.id }] })
      expect((await prisma.assignment.findFirstOrThrow()).paId).toBe(f.pa.id)
      await expect(applyWorkshopChange(form({ id: change.id }))).rejects.toThrow('changed=1')
      const saved = await prisma.assignment.findFirstOrThrow()
      expect(saved).toMatchObject({
        paId: replacement.id,
        source: 'MANUAL',
        status: 'PUBLISHED',
        overrideAvailability: true,
        overrideSameDay: false,
        overrideWeek: false,
        overrideReason: null,
      })
      const state = await loadSchedule(prisma)
      expect(
        eligibility(state, state.workshops.find((item) => item.id === w.id)!, replacement.id)
      ).toEqual([])
      expect((await prisma.workshopEvent.findFirstOrThrow()).after).toMatchObject({
        availabilityOverrides: [{ paId: replacement.id }],
      })
      const detail = await editSession(w.id, 1, [replacement.id], {
        notes: 'Only an internal note changed.',
      })
      await expect(applyWorkshopChange(form({ id: detail.id }))).rejects.toThrow('changed=1')
      expect(await prisma.assignment.findFirstOrThrow()).toMatchObject({
        id: saved.id,
        overrideAvailability: true,
      })
    }
  )

  it('rederives availability exceptions for retained PAs when rescheduling to uncovered and then covered dates', async () => {
    const { w } = await ready()
    await addSessionCandidateFixture(w.id, '2027-01-05')
    await addSessionCandidateFixture(w.id, '2027-01-11')
    const move = await stage({
      id: w.id,
      version: 0,
      kind: 'RESCHEDULE',
      date: '2027-01-05',
      startTime: '10:00',
      endTime: '11:00',
    })
    expect(move.proposed).toMatchObject({ availabilityOverrides: [{ paId: f.pa.id }] })
    await expect(applyWorkshopChange(form({ id: move.id }))).rejects.toThrow('changed=1')
    expect(await prisma.assignment.findFirstOrThrow()).toMatchObject({
      paId: f.pa.id,
      overrideAvailability: true,
      status: 'PUBLISHED',
    })
    const backToCovered = await stage({
      id: w.id,
      version: 1,
      kind: 'RESCHEDULE',
      date: '2027-01-11',
      startTime: '10:00',
      endTime: '11:00',
    })
    expect(backToCovered.proposed).toMatchObject({ availabilityOverrides: [] })
    await expect(applyWorkshopChange(form({ id: backToCovered.id }))).rejects.toThrow('changed=1')
    expect((await prisma.assignment.findFirstOrThrow()).overrideAvailability).toBe(false)
  })

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
      data: [600, 615, 630, 645].map((startMin) => ({
        userId: replacement.id,
        dayOfWeek: 0,
        startMin,
      })),
    })
    const refreshed = await stage({
      id: w.id,
      version: 0,
      kind: 'REPLACE',
      oldPaId: f.pa.id,
      newPaId: replacement.id,
    })
    await Promise.allSettled([
      applyWorkshopChange(form({ id: refreshed.id })),
      applyWorkshopChange(form({ id: refreshed.id })),
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
  it('moves across months without monthly quotas and revalidates retained PA availability', async () => {
    const { w, replacement } = await ready()
    await addSessionCandidateFixture(w.id, '2027-02-01')
    await prisma.assignment.create({
      data: { workshopSessionId: w.id, paId: replacement.id, status: 'PUBLISHED' },
    })
    const data = {
      id: w.id,
      version: 0,
      kind: 'RESCHEDULE',
      date: '2027-02-01',
      startTime: '10:00',
      endTime: '11:00',
    }
    await prisma.monthlyPAQuota.deleteMany()
    const p = await stage(data)
    expect(
      (await prisma.workshopSession.findUniqueOrThrow({ where: { id: w.id } })).scheduledStart
    ).toEqual(w.scheduledStart)
    const exception = await prisma.pAAvailabilityException.create({
      data: { userId: replacement.id, date: new Date('2027-02-01'), kind: 'UNAVAILABLE' },
    })
    await expect(applyWorkshopChange(form({ id: p.id }))).rejects.toThrow('changed')
    expect(
      (await prisma.workshopSession.findUniqueOrThrow({ where: { id: w.id } })).scheduledStart
    ).toEqual(w.scheduledStart)
    await prisma.pAAvailabilityException.delete({ where: { id: exception.id } })
    const fresh = await stage(data)
    await expect(applyWorkshopChange(form({ id: fresh.id }))).rejects.toThrow('changed=1')
    const s = await loadSchedule(prisma)
    for (const paId of [f.pa.id, replacement.id]) {
      expect(workload(s, paId, '2027-01')).toBe(0)
      expect(workload(s, paId, '2027-02')).toBe(1)
    }
    expect(s.workshops[0].scheduledStart).toEqual(vancouverToUtc('2027-02-01', 600))
  })
  it('rechecks schedule changes and hosting blocks at apply', async () => {
    const { w } = await ready()
    await addSessionCandidateFixture(w.id, '2027-01-11')
    const p = await stage({
      id: w.id,
      version: 0,
      kind: 'RESCHEDULE',
      date: '2027-01-11',
      startTime: '10:00',
      endTime: '11:00',
    })
    await createSessionFixture({
      data: {
        classSectionId: f.sibling.id,
        scheduledStart: vancouverToUtc('2027-01-11', 600),
        scheduledEnd: vancouverToUtc('2027-01-11', 660),
      },
    })
    await expect(applyWorkshopChange(form({ id: p.id }))).rejects.toThrow('changed')
    await prisma.availabilitySlot.deleteMany()
    await expect(applyWorkshopChange(form({ id: p.id }))).rejects.toThrow('changed')
    expect(
      (await prisma.workshopSession.findUniqueOrThrow({ where: { id: w.id } })).scheduledStart
    ).toEqual(w.scheduledStart)
  })
  it('serializes competing published changes and rejects other administrators using a private review', async () => {
    const { w } = await ready()
    await addSessionCandidateFixture(w.id, '2027-01-11')
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
    expect((await prisma.workshopSession.findUniqueOrThrow({ where: { id: w.id } })).version).toBe(
      1
    )
  })
  it('retains published cancellation history, hides draft cancellations and frees quota', async () => {
    const { w } = await ready()
    const p = await stage({ id: w.id, version: 0, kind: 'CANCEL' })
    await expect(applyWorkshopChange(form({ id: p.id }))).rejects.toThrow('changed=1')
    const draft = await createSessionFixture({
      data: {
        classSectionId: f.sibling.id,
        scheduledStart: vancouverToUtc('2027-01-11', 600),
        scheduledEnd: vancouverToUtc('2027-01-11', 660),
      },
    })
    const d = await stage({ id: draft.id, version: 0, kind: 'CANCEL' })
    await expect(applyWorkshopChange(form({ id: d.id }))).rejects.toThrow('changed=1')
    expect(await prisma.workshopSession.count({ where: visibleWorkshop })).toBe(1)
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
    expect((await prisma.workshopSession.findUniqueOrThrow({ where: { id: w.id } })).status).toBe(
      'COMPLETED'
    )
    expect(workload(await loadSchedule(prisma), f.pa.id, '2026-09')).toBe(1)
    expect(
      (await prisma.classWorkshop.findUniqueOrThrow({ where: { id: w.classWorkshopId } })).status
    ).toBe('COMPLETED')
    const future = await createSessionFixture({
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
    await expect(saveAvailability(form({ effectiveFrom: '2027-01-01' }))).rejects.toThrow('saved=1')
    const s = await loadSchedule(prisma),
      scheduled = s.workshops.find((x) => x.id === w.id)!
    expect(eligibility(s, scheduled, f.pa.id)).toContain(
      'Availability does not cover the full workshop.'
    )
    expect(scheduled.status).toBe('PUBLISHED')
    expect(scheduled.version).toBe(0)
    expect(scheduled.assignments.map((a) => a.paId)).toEqual([f.pa.id])
  })
  it('moves a published Monday session to Tuesday with a replacement PA atomically', async () => {
    const { w, replacement } = await ready()
    await addSessionCandidateFixture(w.id, '2027-01-05')
    await prisma.availability.createMany({
      data: [600, 615, 630, 645].map((startMin) => ({
        userId: replacement.id,
        dayOfWeek: 1,
        startMin,
      })),
    })
    const change = await editSession(w.id, 0, [replacement.id], {
      date: '2027-01-05',
      mode: 'IN_PERSON',
      location: 'https://example.test/demo-room',
    })
    expect((await prisma.assignment.findFirstOrThrow()).paId).toBe(f.pa.id)
    await expect(applyWorkshopChange(form({ id: change.id }))).rejects.toThrow('changed=1')
    const saved = await prisma.workshopSession.findUniqueOrThrow({
      where: { id: w.id },
      include: { assignments: true },
    })
    expect(saved.status).toBe('PUBLISHED')
    expect(saved.publishedAt).toEqual(w.publishedAt)
    expect(saved.scheduledStart).toEqual(vancouverToUtc('2027-01-05', 600))
    expect(saved.assignments.map((a) => a.paId)).toEqual([replacement.id])
    expect(saved.notes).toBe('Private admin context')
    expect(saved.participantInstructions).toBe('Check in at the office.')
    expect(saved.mode).toBe('IN_PERSON')
    expect(await prisma.workshopEvent.count()).toBe(1)
  })
  it('retains a published event when its last PA is removed and records affected participants', async () => {
    const { w } = await ready()
    const change = await editSession(w.id, 0, [])
    await expect(applyWorkshopChange(form({ id: change.id }))).rejects.toThrow('changed=1')
    const saved = await prisma.workshopSession.findUniqueOrThrow({
      where: { id: w.id },
      include: { assignments: true },
    })
    expect(saved.status).toBe('PUBLISHED')
    expect(saved.assignments).toHaveLength(0)
    expect(saved.minPAs).toBe(1)
    const event = await prisma.workshopEvent.findFirstOrThrow()
    expect(event.affectedPAIds).toEqual([f.pa.id])
    expect(needsCommunication(event)).toBe(true)
  })
  it('requires a confirmed date exception and preserves it through a later detail edit', async () => {
    const { w } = await ready()
    await prisma.workshopDefinition.update({
      where: {
        id: (await prisma.classWorkshop.findUniqueOrThrow({ where: { id: w.classWorkshopId } }))
          .workshopDefinitionId,
      },
      data: { deliveryStartsOn: new Date('2027-01-04'), deliveryEndsOn: new Date('2027-01-08') },
    })
    const change = await editSession(w.id, 0, [], { date: '2027-02-01' })
    await expect(applyWorkshopChange(form({ id: change.id }))).rejects.toThrow('delivery')
    expect((await prisma.workshopSession.findUniqueOrThrow({ where: { id: w.id } })).version).toBe(
      0
    )
    await expect(
      applyWorkshopChange(form({ id: change.id, dateExceptionConfirmed: 'on' }))
    ).rejects.toThrow('changed=1')
    const saved = await prisma.workshopSession.findUniqueOrThrow({ where: { id: w.id } })
    expect(saved.dateExceptionApprovedBy).toBe(f.admin.id)
    expect(saved.dateExceptionReason).toBe('Teacher and PA confirmed the update.')
    const detail = await editSession(w.id, 1, [], {
      date: '2027-02-01',
      notes: 'Updated internal note',
    })
    await expect(applyWorkshopChange(form({ id: detail.id }))).rejects.toThrow('changed=1')
    const again = await prisma.workshopSession.findUniqueOrThrow({ where: { id: w.id } })
    expect(again.dateExceptionApprovedAt).toEqual(saved.dateExceptionApprovedAt)
    expect(
      (await loadSchedule(prisma)).workshops.find((row) => row.id === w.id)?.hostingValid
    ).toBe(true)
  })
  it('records weekly workload on a combined edit without extra approval and still rejects overlap', async () => {
    const { w, replacement } = await ready()
    await prisma.availability.createMany({
      data: [600, 615, 630, 645].map((startMin) => ({
        userId: replacement.id,
        dayOfWeek: 1,
        startMin,
      })),
    })
    await createSessionFixture({
      data: {
        classSectionId: f.sibling.id,
        scheduledStart: vancouverToUtc('2027-01-05', 600),
        scheduledEnd: vancouverToUtc('2027-01-05', 660),
        assignments: { create: { paId: replacement.id } },
      },
    })
    const change = await editSession(w.id, 0, [replacement.id])
    expect(
      (await prisma.assignment.findFirstOrThrow({ where: { workshopSessionId: w.id } })).paId
    ).toBe(f.pa.id)
    await expect(applyWorkshopChange(form({ id: change.id }))).rejects.toThrow('changed=1')
    expect(
      (await prisma.assignment.findFirstOrThrow({ where: { workshopSessionId: w.id } }))
        .overrideWeek
    ).toBe(true)
    const overlap = form({
      id: w.id,
      version: 1,
      kind: 'RESCHEDULE',
      date: '2027-01-05',
      startTime: '10:00',
      endTime: '11:00',
      reason: 'Override attempt',
      dateExceptionConfirmed: 'on',
    })
    await expect(stageWorkshopChange(overlap)).rejects.toThrow('Conflicting%20assignment')
    expect(
      (await prisma.workshopSession.findUniqueOrThrow({ where: { id: w.id } })).scheduledStart
    ).toEqual(w.scheduledStart)
  })
  it('acknowledges one communication event without acknowledging a newer change', async () => {
    const { w } = await ready()
    const first = await editSession(w.id, 0, [], {
      participantInstructions: 'Use the side entrance.',
    })
    await expect(applyWorkshopChange(form({ id: first.id }))).rejects.toThrow('changed=1')
    const firstEvent = await prisma.workshopEvent.findFirstOrThrow()
    const second = await editSession(w.id, 1, [], {
      participantInstructions: 'Use the front entrance.',
    })
    await expect(applyWorkshopChange(form({ id: second.id }))).rejects.toThrow('changed=1')
    await expect(
      markWorkshopCommunicated(
        form({
          eventId: firstEvent.id,
          contacted: 'Teacher and former PA',
          note: 'Phone calls complete.',
        })
      )
    ).rejects.toThrow('#history')
    const events = await prisma.workshopEvent.findMany({ orderBy: { createdAt: 'asc' } })
    expect(events[0].communicatedById).toBe(f.admin.id)
    expect(events[1].communicatedAt).toBeNull()
  })
})
