import { test, expect } from '@playwright/test'
import { prisma } from '../../src/lib/db'
import { resetFixtures } from '../fixtures'
import { login } from './helpers'

test.afterAll(async () => {
  await prisma.$disconnect()
})

test('class availability fixes return to the same planning preview and restore row entries', async ({
  page,
}) => {
  const f = await resetFixtures()
  await prisma.classMeeting.deleteMany({ where: { classSectionId: f.sibling.id } })
  await login(page, f.admin.email, 'admin')
  await page.goto('/admin/workshops/plan?month=2027-01&schoolId=' + f.school.id)
  await page.getByRole('button', { name: 'Preview slots' }).click()

  const dates = page.locator('input[name="date"]')
  const times = page.locator('input[name="startTime"]')
  const durations = page.locator('input[name="durationMinutes"]')
  await expect(dates).toHaveCount(1)
  await dates.nth(0).fill('2027-01-04')
  await times.nth(0).fill('10:00')
  await durations.nth(0).fill('75')

  await page.getByRole('link', { name: 'Add class availability before planning' }).click()
  await expect(page).toHaveURL(new RegExp('/admin/classes/' + f.sibling.id + '/edit'))

  await page.getByLabel('Default minimum PAs').fill('5')
  await page.getByLabel('Default maximum PAs').fill('3')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Maximum staffing must be at least the minimum'
  )

  await page.getByLabel('Default minimum PAs').fill('1')
  await page.getByLabel('Default maximum PAs').fill('3')
  await page.getByLabel('Default duration (minutes)').fill('45')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page).toHaveURL(new RegExp('/admin/classes/' + f.sibling.id + '/edit'))
  await expect(page).not.toHaveURL(/error=/)

  await page.getByLabel('Day', { exact: true }).selectOption('0')
  await page.getByLabel('Start time').fill('10:30')
  await page.getByLabel('End time').fill('09:30')
  await page.getByRole('button', { name: 'Add availability' }).click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'End time must be after start time'
  )

  await page.getByLabel('Start time').fill('09:00')
  await page.getByLabel('End time').fill('12:00')
  await page.getByRole('button', { name: 'Add availability' }).click()
  await expect(page).not.toHaveURL(/error=/)
  await expect(page.getByText('Monday · 09:00–12:00')).toBeVisible()

  await page.getByLabel('Day', { exact: true }).selectOption('0')
  await page.getByLabel('Start time').fill('09:30')
  await page.getByLabel('End time').fill('10:30')
  await page.getByRole('button', { name: 'Add availability' }).click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Availability blocks cannot overlap'
  )

  await page.getByRole('link', { name: 'Return to monthly planning' }).click()
  await expect(page.getByRole('heading', { name: /Missing occurrences/ })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: /Fixture Biology/ })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: /Fixture Chemistry/ })).toBeChecked()
  await expect(dates).toHaveCount(2)
  await expect(dates.nth(0)).toHaveValue('2027-01-04')
  await expect(times.nth(0)).toHaveValue('10:00')
  await expect(durations.nth(0)).toHaveValue('75')
  await expect(durations.nth(1)).toHaveValue('45')
})
