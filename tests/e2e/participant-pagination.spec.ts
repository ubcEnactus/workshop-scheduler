import { expect, test } from '@playwright/test'

import { prisma } from '../../src/lib/db'
import { resetFixtures } from '../fixtures'
import { login } from './helpers'

test.afterAll(() => prisma.$disconnect())

function weekdayAt(index: number) {
  const date = new Date(Date.UTC(2026, 0, 5, 18))
  let remaining = index
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1)
    const day = date.getUTCDay()
    if (day >= 1 && day <= 5) remaining -= 1
  }
  return date
}

test('pages participant history and preserves archived snapshots and real PA changes', async ({
  browser,
}) => {
  const f = await resetFixtures()
  await prisma.workshopDefinition.create({
    data: { id: 'participant-definition-21', title: 'Participant workshop 21' },
  })
  const historyClassWorkshops = Array.from({ length: 21 }, (_, index) => ({
    id: `participant-class-workshop-${index}`,
    classSectionId: f.cls.id,
    workshopDefinitionId:
      index < 20 ? `fixture-definition-${index + 1}` : 'participant-definition-21',
  }))
  await prisma.classWorkshop.createMany({
    data: historyClassWorkshops,
  })
  const history = Array.from({ length: 21 }, (_, index) => {
    const start = weekdayAt(index)
    return {
      id: `participant-history-${index}`,
      classWorkshopId: historyClassWorkshops[index].id,
      scheduledStart: start,
      scheduledEnd: new Date(start.getTime() + 60 * 60 * 1000),
      status: 'PUBLISHED' as const,
      publishedAt: start,
      hostClassName: 'Snapshot Biology',
      hostSchoolName: 'Archived School Snapshot',
      hostTeacherName: 'Snapshot Teacher',
    }
  })
  await prisma.workshopSession.createMany({ data: history })
  await prisma.assignment.createMany({
    data: history.map((session) => ({
      workshopSessionId: session.id,
      paId: f.pa.id,
      status: 'PUBLISHED' as const,
    })),
  })

  await prisma.classSection.update({
    where: { id: f.sibling.id },
    data: { name: 'Archived change sentinel' },
  })
  const sentinelClassWorkshop = await prisma.classWorkshop.create({
    data: {
      classSectionId: f.sibling.id,
      workshopDefinitionId: 'fixture-definition-2',
    },
  })
  const sentinelSession = await prisma.workshopSession.create({
    data: {
      id: 'participant-change-sentinel',
      classWorkshopId: sentinelClassWorkshop.id,
      scheduledStart: new Date('2026-02-03T18:00:00.000Z'),
      scheduledEnd: new Date('2026-02-03T19:00:00.000Z'),
      status: 'PUBLISHED',
      publishedAt: new Date('2026-02-01T18:00:00.000Z'),
    },
  })
  const assignedState = {
    status: 'PUBLISHED' as const,
    start: sentinelSession.scheduledStart.toISOString(),
    end: sentinelSession.scheduledEnd.toISOString(),
    pas: [{ id: f.pa.id, name: f.pa.name ?? f.pa.email }],
  }
  const removedState = { ...assignedState, pas: [] }
  await prisma.workshopEvent.create({
    data: {
      workshopSessionId: sentinelSession.id,
      actorId: f.admin.id,
      actorName: f.admin.name ?? f.admin.email,
      kind: 'EDIT',
      reason: 'Oldest real removal',
      before: assignedState,
      after: removedState,
      wasPublished: true,
      affectedPAIds: [f.pa.id],
      createdAt: new Date('2026-03-01T12:00:00.000Z'),
    },
  })
  await prisma.workshopEvent.createMany({
    data: [
      ...Array.from({ length: 20 }, (_, index) => ({
        id: `participant-real-change-${index}`,
        workshopSessionId: history.at(-1)!.id,
        actorId: f.admin.id,
        actorName: f.admin.name ?? f.admin.email,
        kind: 'EDIT',
        reason: `Real removal ${index}`,
        before: assignedState,
        after: removedState,
        wasPublished: true,
        affectedPAIds: [f.pa.id],
        createdAt: new Date(Date.UTC(2026, 3, index + 1, 12)),
      })),
      ...Array.from({ length: 25 }, (_, index) => ({
        id: `participant-unchanged-edit-${index}`,
        workshopSessionId: history.at(-1)!.id,
        actorId: f.admin.id,
        actorName: f.admin.name ?? f.admin.email,
        kind: 'EDIT',
        reason: `Unchanged edit ${index}`,
        before: assignedState,
        after: assignedState,
        wasPublished: true,
        affectedPAIds: [f.pa.id],
        createdAt: new Date(Date.UTC(2026, 4, index + 1, 12)),
      })),
    ],
  })

  const paContext = await browser.newContext()
  const teacherContext = await browser.newContext()
  const pa = await paContext.newPage()
  const teacher = await teacherContext.newPage()
  await login(pa, f.pa.email, 'pa')
  await login(teacher, f.teacher.email, 'teacher')

  const paHistory = pa
    .getByRole('heading', { name: 'Workshop history' })
    .locator('xpath=ancestor::section[1]')
  await expect(paHistory.getByRole('listitem')).toHaveCount(20)
  await expect(paHistory.getByRole('link', { name: /Next history/ })).toBeVisible()
  const teacherHistory = teacher
    .getByRole('heading', { name: 'Workshop history' })
    .locator('xpath=ancestor::section[1]')
  await expect(teacherHistory.getByRole('listitem')).toHaveCount(20)
  await expect(teacherHistory.getByRole('link', { name: /Next history/ })).toBeVisible()

  const changes = pa
    .getByRole('heading', { name: 'Assignment changes' })
    .locator('xpath=ancestor::section[1]')
  await expect(changes.getByText('Your assignment was removed.')).toHaveCount(20)
  await changes.getByRole('link', { name: /Next changes/ }).click()
  await expect(pa).toHaveURL(/changePage=2/)
  await expect(pa.getByText(/Archived change sentinel: Your assignment was removed/)).toBeVisible()

  await prisma.school.update({ where: { id: f.school.id }, data: { deletedAt: new Date() } })
  await pa.goto('/pa?historyPage=2')
  await expect(pa.getByText('Snapshot Biology', { exact: true })).toBeVisible()
  await expect(pa.getByText('Archived School Snapshot', { exact: true })).toBeVisible()

  await paContext.close()
  await teacherContext.close()
})
