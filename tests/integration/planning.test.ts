import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, expect, it, vi } from 'vitest'
import { prisma } from '../../src/lib/db'
import { resetFixtures } from '../fixtures'
const { sessionAuth } = vi.hoisted(() => ({ sessionAuth: vi.fn() }))
vi.mock('next-auth', () => ({ default: () => ({ auth: sessionAuth }) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error('REDIRECT:' + url)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
import { createWorkshopBatch } from '../../src/app/admin/workshops/plan/actions'
import { updateClassSection } from '../../src/app/admin/classes/actions'
import { form } from '../fixtures'
let f: Awaited<ReturnType<typeof resetFixtures>>
beforeEach(async () => {
  f = await resetFixtures()
  sessionAuth.mockResolvedValue({ user: { id: f.admin.id } })
})
afterAll(async () => {
  await prisma.$disconnect()
})
function batch(dates: string[], key = randomUUID(), classId = f.cls.id) {
  const data = form({ requestKey: key, month: dates[0]?.slice(0, 7) ?? '2027-01' })
  for (const date of dates)
    for (const [name, value] of Object.entries({
      classSectionId: classId,
      date,
      startTime: '10:00',
      durationMinutes: '60',
      minPAs: '1',
      maxPAs: '3',
    }))
      data.append(name, value)
  return data
}
it('authorizes batch creation before parsing', async () => {
  sessionAuth.mockResolvedValue({ user: { id: f.teacher.id } })
  await expect(createWorkshopBatch(new FormData())).rejects.toThrow('REDIRECT:/403')
})
it('creates selected monthly occurrences once, including concurrent retries', async () => {
  await prisma.classSection.update({ where: { id: f.cls.id }, data: { monthlyCadence: 2 } })
  const data = batch(['2027-01-04', '2027-01-11'])
  const results = await Promise.allSettled([createWorkshopBatch(data), createWorkshopBatch(data)])
  for (const result of results)
    expect(result.status === 'rejected' && result.reason.message).toMatch(/batch=/)
  expect(await prisma.workshop.count()).toBe(2)
  expect(await prisma.workshopBatch.count()).toBe(1)
  await expect(createWorkshopBatch(batch(['2027-01-18']))).rejects.toThrow(
    'monthly%20plan%20changed'
  )
  await expect(createWorkshopBatch(batch(['2027-02-01', '2027-02-08']))).rejects.toThrow('batch=')
  expect(await prisma.workshop.count()).toBe(4)
})
it('rolls back the whole batch when a later date is invalid and rejects changed retry payloads', async () => {
  await prisma.classSection.update({ where: { id: f.cls.id }, data: { monthlyCadence: 2 } })
  const key = randomUUID()
  await expect(createWorkshopBatch(batch(['2027-01-04', '2027-01-06'], key))).rejects.toThrow(
    'hosting%20block'
  )
  expect(await prisma.workshop.count()).toBe(0)
  expect(await prisma.workshopBatch.count()).toBe(0)
  await expect(createWorkshopBatch(batch(['2027-01-04'], key))).rejects.toThrow('batch=')
  await expect(createWorkshopBatch(batch(['2027-01-11'], key))).rejects.toThrow(
    'different%20workshop%20choices'
  )
})
it('treats cadence changes prospectively and cancellations as missing occurrences', async () => {
  await expect(createWorkshopBatch(batch(['2027-01-04']))).rejects.toThrow('batch=')
  const old = await prisma.workshop.findFirstOrThrow()
  await expect(
    updateClassSection(
      form({
        id: f.cls.id,
        name: f.cls.name,
        teacherId: f.teacher.id,
        monthlyCadence: 2,
        defaultDurationMinutes: 30,
        defaultMinPAs: 1,
        defaultMaxPAs: 2,
      })
    )
  ).rejects.toThrow('REDIRECT:/admin/classes')
  const unchanged = await prisma.workshop.findUniqueOrThrow({ where: { id: old.id } })
  expect(unchanged.scheduledEnd).toEqual(old.scheduledEnd)
  expect(unchanged.maxPAs).toBe(3)
  await expect(createWorkshopBatch(batch(['2027-01-11']))).rejects.toThrow('batch=')
  await prisma.workshop.update({ where: { id: old.id }, data: { status: 'CANCELLED' } })
  await expect(createWorkshopBatch(batch(['2027-01-04']))).rejects.toThrow('batch=')
  expect(await prisma.workshop.count()).toBe(3)
})
