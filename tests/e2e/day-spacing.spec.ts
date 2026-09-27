import { createSessionFixture } from '../fixtures'
import { test, expect } from '@playwright/test'
import { prisma } from '../../src/lib/db'
import { resetFixtures } from '../fixtures'
import { vancouverToUtc } from '../../src/lib/time'
import { login } from './helpers'

test.afterAll(async () => {
  await prisma.$disconnect()
})
test('consecutive same-school classes stay blocked until the first assignment is removed', async ({
  page,
}) => {
  const f = await resetFixtures()
  await prisma.availability.createMany({
    data: [600, 615, 630, 645, 660, 675, 690, 705].map((startMin) => ({
      userId: f.pa.id,
      dayOfWeek: 0,
      startMin,
    })),
  })
  const workshops = await Promise.all(
    [f.cls.id, f.sibling.id].map((classSectionId, i) =>
      createSessionFixture({
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
  await page.goto('/admin/workshops/' + workshops[0].id)
  await page.getByRole('button', { name: 'Assign Fixture PA', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove PA', exact: true })).toBeVisible()
  await page.goto('/admin/workshops/' + workshops[1].id)
  await page.getByText('Blocked PAs (1)', { exact: true }).click()
  await expect(
    page.getByText(/PA cannot teach consecutive sessions at the same school/)
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Assign Fixture PA', exact: true })).toHaveCount(0)
  await page.goto('/admin/workshops/' + workshops[0].id)
  await page.getByRole('button', { name: 'Remove PA', exact: true }).click()
  await expect
    .poll(() =>
      prisma.assignment.count({
        where: { workshopSessionId: workshops[0].id, paId: f.pa.id },
      })
    )
    .toBe(0)
  await page.goto('/admin/workshops/' + workshops[1].id)
  await page.getByRole('button', { name: 'Assign Fixture PA', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove PA', exact: true })).toBeVisible()
  expect(await prisma.assignment.count()).toBe(1)
})
