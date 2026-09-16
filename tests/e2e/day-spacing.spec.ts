import { test, expect } from '@playwright/test'
import { prisma } from '../../src/lib/db'
import { resetFixtures } from '../fixtures'
import { vancouverToUtc } from '../../src/lib/time'
import { login } from './helpers'

test.afterAll(async () => {
  await prisma.$disconnect()
})
test('day spacing blocks a second class visit until the first assignment is removed', async ({
  page,
}) => {
  const f = await resetFixtures()
  await prisma.monthlyPAQuota.create({ data: { paId: f.pa.id, month: '2027-01', quota: 4 } })
  await prisma.availability.createMany({
    data: [600, 630, 660, 690].map((startMin) => ({ userId: f.pa.id, dayOfWeek: 0, startMin })),
  })
  const workshops = await Promise.all(
    [f.cls.id, f.sibling.id].map((classSectionId, i) =>
      prisma.workshop.create({
        data: {
          classSectionId,
          scheduledStart: vancouverToUtc('2027-01-04', 600 + i * 60),
          scheduledEnd: vancouverToUtc('2027-01-04', 660 + i * 60),
          minPAs: 1,
          maxPAs: 1,
        },
      })
    )
  )
  await login(page, f.admin.email, 'admin')
  await page.goto('/admin/staffing?month=2027-01')
  await page.getByLabel('Minimum gap between assignments (days)').fill('1')
  await page.getByRole('button', { name: 'Save gap', exact: true }).click()
  await page.reload()
  await expect(page.getByLabel('Minimum gap between assignments (days)')).toHaveValue('1')
  await expect(page.getByLabel('Quota month')).toHaveValue('2027-01')
  await page.goto('/admin/workshops/' + workshops[0].id)
  await page.getByText('Choose a PA', { exact: true }).click()
  await page.getByRole('button', { name: 'Assign Fixture PA', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove PA', exact: true })).toBeVisible()
  await page.goto('/admin/workshops/' + workshops[1].id)
  await page.getByText('Choose a PA', { exact: true }).click()
  await expect(
    page.getByText(/PA already has a workshop at this school on this Vancouver date/)
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Assign Fixture PA', exact: true })).toHaveCount(0)
  await page.goto('/admin/workshops/' + workshops[0].id)
  await page.getByRole('button', { name: 'Remove PA', exact: true }).click()
  await page.goto('/admin/workshops/' + workshops[1].id)
  await page.getByText('Choose a PA', { exact: true }).click()
  await page.getByRole('button', { name: 'Assign Fixture PA', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove PA', exact: true })).toBeVisible()
  expect(await prisma.assignment.count()).toBe(1)
})
