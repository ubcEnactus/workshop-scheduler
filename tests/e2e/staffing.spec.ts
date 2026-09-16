import { test, expect } from '@playwright/test'
import { prisma } from '../../src/lib/db'
import { resetFixtures } from '../fixtures'
import { login } from './helpers'

test.afterAll(async () => {
  await prisma.$disconnect()
})
test('admin staffs and publishes a workshop after PA availability; only the correct people see it', async ({
  page,
  browser,
}) => {
  const f = await resetFixtures()
  const paContext = await browser.newContext(),
    teacherContext = await browser.newContext(),
    otherContext = await browser.newContext()
  const pa = await paContext.newPage(),
    teacher = await teacherContext.newPage(),
    other = await otherContext.newPage()
  await login(pa, f.pa.email, 'pa')
  await pa.goto('/pa/availability')
  await pa.getByText('Edit individual half-hour slots', { exact: true }).click()
  for (const value of ['0-600', '0-630']) await pa.locator('input[value="' + value + '"]').check()
  await pa.getByRole('button', { name: 'Save availability' }).click()
  await expect(pa.getByText('Availability saved.', { exact: true })).toBeVisible()
  await login(page, f.admin.email, 'admin')
  await page.goto('/admin/staffing?month=2027-01')
  await page.getByLabel('Minimum gap between assignments (days)').fill('1')
  await page.getByRole('button', { name: 'Save gap' }).click()
  await expect(page.getByRole('status')).toContainText('Settings saved')
  await expect(page.getByLabel('Quota month')).toHaveValue('2027-01')
  await page.getByLabel('Quota for Fixture PA').fill('1')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('status')).toContainText('Settings saved')
  await page.goto('/admin/workshops?month=2027-01')
  await page.getByText('Add workshop', { exact: true }).click()
  await page.getByLabel('Class', { exact: true }).selectOption(f.cls.id)
  await page.getByLabel('Vancouver date').fill('2027-01-04')
  await page.getByLabel('Start time', { exact: true }).fill('10:00')
  await page.getByLabel('End time', { exact: true }).fill('11:00')
  await page.getByRole('button', { name: 'Create draft' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved.' })).toHaveText(
    'Draft saved.'
  )
  await page.getByText('Choose a PA', { exact: true }).click()
  await page.getByRole('button', { name: 'Assign Fixture PA', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove PA' })).toBeVisible()
  await pa.goto('/pa')
  await expect(pa.getByText('Fixture Biology', { exact: true })).toHaveCount(0)
  await login(teacher, f.teacher.email, 'teacher')
  await expect(teacher.getByText('Fixture Biology', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Publish workshop' }).click()
  await expect(page.getByText(/Status: published/)).toBeVisible()
  await pa.reload()
  await teacher.reload()
  await expect(pa.getByText('Fixture Biology', { exact: true })).toBeVisible()
  await expect(teacher.getByText('Fixture Biology', { exact: true })).toBeVisible()
  await login(other, f.otherTeacher.email, 'teacher')
  await expect(other.getByText('Fixture Biology', { exact: true })).toHaveCount(0)
  await paContext.close()
  await teacherContext.close()
  await otherContext.close()
})
