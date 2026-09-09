import { test, expect } from '@playwright/test'
import { prisma } from '../../src/lib/db'
import { resetFixtures } from '../fixtures'
import { login } from './helpers'
test.afterAll(async () => {
  await prisma.$disconnect()
})
test('plans two months for selected classes with different cadences and keeps existing slots', async ({
  page,
}) => {
  const f = await resetFixtures()
  await prisma.classSection.update({ where: { id: f.sibling.id }, data: { monthlyCadence: 2 } })
  await login(page, f.admin.email, 'admin')
  for (const month of ['2027-01', '2027-02']) {
    await page.goto('/admin/workshops/plan?month=' + month)
    await page.getByRole('button', { name: 'Select all classes' }).click()
    await page.getByRole('button', { name: 'Preview slots' }).click()
    const dates = page.locator('input[name="date"]'),
      times = page.locator('input[name="startTime"]')
    await expect(dates).toHaveCount(3)
    await dates.nth(0).fill(month + '-' + (month.endsWith('01') ? '04' : '01'))
    await dates.nth(1).fill(month + '-' + (month.endsWith('01') ? '04' : '01'))
    await dates.nth(2).fill(month + '-' + (month.endsWith('01') ? '11' : '08'))
    await times.nth(0).fill('09:00')
    await times.nth(1).fill('11:00')
    await times.nth(2).fill('11:00')
    await page.getByRole('button', { name: 'Create planned workshops' }).click()
    await expect(page).toHaveURL(/batch=/)
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(4)
    await page.goto('/admin/workshops/plan?month=' + month)
    await page.getByRole('button', { name: 'Select all classes' }).click()
    await page.getByRole('button', { name: 'Preview slots' }).click()
    await expect(
      page.getByText('No missing occurrences can be planned from the current selection.')
    ).toBeVisible()
  }
  expect(await prisma.workshop.count()).toBe(6)
  await page.goto('/admin/workshops/plan?month=2027-03')
  await page.getByRole('checkbox', { name: /Fixture Biology/ }).check()
  await page.getByRole('button', { name: 'Preview slots' }).click()
  await expect(page.locator('input[name="date"]')).toHaveCount(1)
})
