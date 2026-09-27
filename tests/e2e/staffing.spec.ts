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
  const editor = pa.getByRole('region', { name: 'Availability editor' })
  await editor.getByLabel('From', { exact: true }).selectOption('600')
  await editor.getByLabel('Until', { exact: true }).selectOption('660')
  await editor.getByRole('button', { name: 'Add time range', exact: true }).click()
  await pa.getByRole('button', { name: 'Save availability' }).click()
  await expect(pa.getByText('Availability saved.', { exact: true })).toBeVisible()
  await login(page, f.admin.email, 'admin')
  await page.goto('/admin/staffing?month=2027-01')
  await expect(page.getByText('Monthly quotas are not required for assignment.')).toBeVisible()
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: 'Fixture PA' })
      .getByText('4 effective 15-minute slot records')
  ).toBeVisible()
  await page.goto('/admin/workshops?month=2027-01')
  await page
    .getByRole('link', { name: 'Schedule a confirmed teacher session', exact: true })
    .click()
  await page.getByLabel('Workshop', { exact: true }).selectOption('fixture-definition-1')
  await page.getByLabel('Choose or add a school').selectOption(f.school.id)
  await page.getByLabel('Choose or add a teacher').selectOption(f.teacher.id)
  await page.getByLabel('Vancouver date').fill('2027-01-04')
  await page.getByLabel('Start time', { exact: true }).fill('10:00')
  await page.getByLabel('End time', { exact: true }).fill('11:00')
  await page.getByRole('button', { name: 'Schedule teacher session' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved.' })).toHaveText(
    'Draft saved.'
  )
  await page.getByRole('button', { name: 'Assign Fixture PA', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove PA' })).toBeVisible()
  await pa.goto('/pa')
  await expect(pa.getByText('Fixture Biology', { exact: true })).toHaveCount(0)
  await login(teacher, f.teacher.email, 'teacher')
  await expect(teacher.getByText('Fixture Biology', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Publish session' }).click()
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
