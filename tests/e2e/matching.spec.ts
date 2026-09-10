import { test, expect } from '@playwright/test'
import { prisma } from '../../src/lib/db'
import { resetFixtures } from '../fixtures'
import { vancouverToUtc } from '../../src/lib/time'
import { login } from './helpers'
test('preview, apply, manually adjust, rerun and publish without moving dates', async ({
  page,
}) => {
  const f = await resetFixtures()
  await prisma.schedulingSettings.update({ where: { id: 1 }, data: { minimumGapMinutes: 60 } })
  await prisma.monthlyPAQuota.create({ data: { paId: f.pa.id, month: '2027-01', quota: 1 } })
  await prisma.availability.createMany({
    data: [600, 630].map((startMin) => ({ userId: f.pa.id, dayOfWeek: 0, startMin })),
  })
  const w = await prisma.workshop.create({
    data: {
      classSectionId: f.cls.id,
      scheduledStart: vancouverToUtc('2027-01-04', 600),
      scheduledEnd: vancouverToUtc('2027-01-04', 660),
      maxPAs: 1,
    },
  })
  await login(page, f.admin.email, 'admin')
  await page.goto('/admin/workshops/match?month=2027-01')
  await page.getByRole('button', { name: 'Preview PA assignments' }).click()
  await expect(page.getByRole('heading', { name: 'Review PA assignments' })).toBeVisible()
  expect(await prisma.assignment.count()).toBe(0)
  await page.getByRole('button', { name: 'Apply PA assignments' }).click()
  await expect(page).toHaveURL(/matched=1/)
  await page.goto('/admin/workshops/' + w.id)
  await page.getByRole('button', { name: 'Remove' }).click()
  await page
    .locator('summary')
    .filter({ hasText: /^\s*Choose a PA\s*$/ })
    .click()
  await page.getByRole('button', { name: 'Assign Fixture PA', exact: true }).click()
  await page.goto('/admin/workshops/match?month=2027-01')
  await page.getByRole('button', { name: 'Preview PA assignments' }).click()
  await expect(page.getByText('Workshop is locked.')).toBeVisible()
  await page.getByRole('button', { name: 'Apply PA assignments' }).click()
  await page.goto('/admin/workshops/' + w.id)
  await page.getByRole('button', { name: 'Publish workshop', exact: true }).click()
  await expect(page).toHaveURL(/published=1/)
  expect((await prisma.workshop.findUniqueOrThrow({ where: { id: w.id } })).scheduledStart).toEqual(
    w.scheduledStart
  )
})
