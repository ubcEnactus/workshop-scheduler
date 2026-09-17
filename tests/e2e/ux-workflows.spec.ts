import { mkdir } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { prisma } from '../../src/lib/db'
import { resetFixtures } from '../fixtures'
import { vancouverToUtc } from '../../src/lib/time'
import { login } from './helpers'
test.afterAll(async () => {
  await prisma.$disconnect()
})
async function ready() {
  const f = await resetFixtures()
  await prisma.schedulingSettings.update({ where: { id: 1 }, data: { minimumGapDays: 1 } })
  await prisma.monthlyPAQuota.create({ data: { paId: f.pa.id, month: '2027-01', quota: 5 } })
  await prisma.availability.createMany({
    data: [600, 630].map((startMin) => ({ userId: f.pa.id, dayOfWeek: 0, startMin })),
  })
  const workshop = await prisma.workshop.create({
    data: {
      classSectionId: f.cls.id,
      scheduledStart: vancouverToUtc('2027-01-04', 600),
      scheduledEnd: vancouverToUtc('2027-01-04', 660),
      minPAs: 1,
      maxPAs: 1,
    },
  })
  return { ...f, workshop }
}
test('month and filters survive planning, sidebar, matching, quotas, Back and reload', async ({
  page,
}) => {
  const f = await ready()
  await login(page, f.admin.email, 'admin')
  await page.goto('/admin/workshops?month=2027-01')
  await page.getByLabel('School filter').selectOption(f.school.id)
  await expect(page).toHaveURL(new RegExp('schoolId=' + f.school.id))
  await page.getByLabel('Class filter').selectOption(f.cls.id)
  await expect(page).toHaveURL(new RegExp('classSectionId=' + f.cls.id))
  await page.getByRole('link', { name: 'Plan monthly workshops', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: /Fixture Biology/ })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: /Fixture Chemistry/ })).not.toBeChecked()
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Assign PAs', exact: true })
    .click()
  await expect(page.getByLabel('Month', { exact: true })).toHaveValue('2027-01')
  await expect(page.getByRole('checkbox', { name: /Fixture Biology/ })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: /Fixture Chemistry/ })).not.toBeChecked()
  await page.getByRole('button', { name: 'Preview PA assignments' }).click()
  await page.getByRole('button', { name: 'Apply PA assignments' }).click()
  await expect(page).toHaveURL(new RegExp('classSectionId=' + f.cls.id))
  await page.getByRole('link', { name: 'PA quotas and assignment gap', exact: true }).click()
  await expect(page.getByLabel('Quota month')).toHaveValue('2027-01')
  await page.getByRole('button', { name: 'Save gap', exact: true }).click()
  await expect(page).toHaveURL(new RegExp('schoolId=' + f.school.id))
  await page.getByRole('link', { name: 'Back to workshops' }).click()
  await expect(page).toHaveURL(/\/admin\/workshops\?/)
  await page.reload()
  await expect(page.getByLabel('Class filter')).toHaveValue(f.cls.id)
  await page.getByRole('link', { name: 'Next month' }).click()
  await expect(page.getByLabel('Month', { exact: true })).toHaveValue('2027-02')
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/admin/workshops' &&
      url.searchParams.get('month') === '2027-02' &&
      url.searchParams.get('schoolId') === f.school.id &&
      url.searchParams.get('classSectionId') === f.cls.id
  )
  await page.goBack()
  await expect(page.getByLabel('Month', { exact: true })).toHaveValue('2027-01')
})
test('staffs in place, restores keyboard focus and publishes through a reviewed selection', async ({
  page,
}) => {
  const f = await ready()
  await login(page, f.admin.email, 'admin')
  await page.goto('/admin/workshops?month=2027-01')
  await mkdir('work/ux-implementation', { recursive: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  const staff = page.getByRole('button', { name: 'Staff Fixture Biology', exact: true })
  expect((await staff.boundingBox())!.y).toBeLessThan(900)
  await staff.click()
  const dialog = page.getByRole('dialog', { name: 'Staff Fixture Biology', exact: true })
  await dialog.getByRole('button', { name: 'Close', exact: true }).focus()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.locator('summary')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
  await dialog.getByRole('button', { name: 'Assign Fixture PA', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Remove Fixture PA', exact: true })).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/admin/workshops')
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.screenshot({ path: 'work/ux-implementation/staffing-panel.png', fullPage: true })
  await page.keyboard.press('Escape')
  await expect(staff).toBeFocused()
  await page.getByRole('checkbox', { name: /Select Fixture Biology .* for publication/ }).check()
  await page.getByRole('button', { name: 'Review publication (1)' }).click()
  await expect(page.getByRole('dialog')).toContainText('Ready to publish')
  await page.getByRole('button', { name: 'Publish selected workshops' }).click()
  await expect(page.getByText('1 workshop published.', { exact: true })).toBeVisible()
  expect((await prisma.workshop.findUniqueOrThrow({ where: { id: f.workshop.id } })).status).toBe(
    'PUBLISHED'
  )
  await page.screenshot({ path: 'work/ux-implementation/month-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.screenshot({ path: 'work/ux-implementation/month-mobile.png', fullPage: true })
  for (const width of [900, 720]) {
    await page.setViewportSize({ width, height: 450 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.getByRole('link', { name: 'Details', exact: true })).toBeVisible()
  }
})

test('bulk review blocks unstaffed drafts and recovers from a stale eligibility snapshot', async ({
  page,
}) => {
  const f = await ready()
  await prisma.assignment.create({
    data: { workshopId: f.workshop.id, paId: f.pa.id, status: 'DRAFT', source: 'MANUAL' },
  })
  await prisma.workshop.create({
    data: {
      classSectionId: f.cls.id,
      scheduledStart: vancouverToUtc('2027-01-11', 600),
      scheduledEnd: vancouverToUtc('2027-01-11', 660),
      minPAs: 1,
      maxPAs: 1,
    },
  })
  await login(page, f.admin.email, 'admin')
  await page.goto('/admin/workshops?month=2027-01')
  await page
    .getByRole('checkbox', { name: /Select Fixture Biology .*Jan 11.* for publication/ })
    .check()
  await page.getByRole('button', { name: 'Review publication (1)' }).click()
  await expect(page.getByRole('button', { name: 'Publish selected workshops' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Select ready drafts', exact: true }).click()
  await expect(
    page.getByRole('checkbox', { name: /Select Fixture Biology .*Jan 11.* for publication/ })
  ).not.toBeChecked()
  await page.getByRole('button', { name: 'Review publication (1)' }).click()
  await prisma.monthlyPAQuota.update({
    where: { paId_month: { paId: f.pa.id, month: '2027-01' } },
    data: { quota: 4 },
  })
  await page.getByRole('button', { name: 'Publish selected workshops' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('eligibility changed')
  expect(await prisma.workshop.count({ where: { status: 'PUBLISHED' } })).toBe(0)
  await page.getByRole('button', { name: 'Reload schedule', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.getByRole('button', { name: 'Staff Fixture Biology', exact: true }).first().click()
  await expect(page.getByRole('dialog')).toContainText('Assigned PAs (1/1–1)')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Review publication (1)' }).click()
  await page.getByRole('button', { name: 'Publish selected workshops' }).click()
  await expect(page.getByText('1 workshop published.', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Monthly schedule/ })).toBeFocused()
  expect(await prisma.workshop.count({ where: { status: 'PUBLISHED' } })).toBe(1)
})
test('quota copy is editable, invalid rows keep inputs, and stale edits cannot overwrite data', async ({
  page,
}) => {
  const f = await ready()
  await prisma.monthlyPAQuota.create({ data: { paId: f.pa.id, month: '2026-12', quota: 8 } })
  await login(page, f.admin.email, 'admin')
  await page.goto('/admin/staffing?month=2027-01')
  const quota = page.getByLabel('Quota for Fixture PA')
  await page.getByRole('button', { name: 'Copy previous month' }).click()
  await expect(quota).toHaveValue('8')
  expect(
    (await prisma.monthlyPAQuota.findFirstOrThrow({ where: { month: '2027-01' } })).quota
  ).toBe(5)
  await page.getByRole('button', { name: 'Undo copy' }).click()
  await expect(quota).toHaveValue('5')
  await quota.fill('-1')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText('No changes were saved')
  await expect(quota).toHaveValue('-1')
  await quota.fill('0')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByText(/Settings saved/)).toBeVisible()
  await expect(quota).toHaveValue('0')
  await prisma.schedulingSettings.update({ where: { id: 1 }, data: { revision: { increment: 1 } } })
  await quota.fill('9')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'changed while you were editing'
  )
  await expect(quota).toHaveValue('9')
  expect(
    (await prisma.monthlyPAQuota.findFirstOrThrow({ where: { month: '2027-01' } })).quota
  ).toBe(0)
})
test('mobile PA ranges copy across the week, support undo and persist without the grid', async ({
  page,
}) => {
  const f = await resetFixtures()
  await login(page, f.pa.email, 'pa')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/pa/availability')
  await page.getByLabel('From', { exact: true }).selectOption('540')
  await page.getByLabel('Until', { exact: true }).selectOption('720')
  await page.getByRole('button', { name: 'Add time range', exact: true }).click()
  for (const day of ['Tuesday', 'Wednesday', 'Thursday', 'Friday'])
    await page.getByRole('checkbox', { name: day, exact: true }).check()
  await page.getByRole('button', { name: 'Copy to selected days' }).click()
  await page.getByRole('button', { name: 'Clear this day', exact: true }).click()
  await page.getByRole('button', { name: 'Undo last edit' }).click()
  await page.getByRole('button', { name: 'Save availability', exact: true }).click()
  await expect(page.getByText('Availability saved.', { exact: true })).toBeVisible()
  expect(await prisma.availability.count()).toBe(30)
  await page.reload()
  await expect(page.getByText(/15 hours per week/)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await mkdir('work/ux-implementation', { recursive: true })
  await page.screenshot({ path: 'work/ux-implementation/availability-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Clear all', exact: true }).click()
  await page.getByRole('button', { name: 'Save availability', exact: true }).click()
  await expect.poll(() => prisma.availability.count()).toBe(0)
})
test('planning keeps all entered dates after overlap and uses explicit suggestions', async ({
  page,
}) => {
  const f = await resetFixtures()
  await login(page, f.admin.email, 'admin')
  await page.goto('/admin/workshops/plan?month=2027-01&schoolId=' + f.school.id)
  await page.getByRole('button', { name: 'Preview slots' }).click()
  const dates = page.locator('input[name="date"]'),
    times = page.locator('input[name="startTime"]')
  await expect(dates).toHaveCount(2)
  await page.getByLabel('Suggested date and time', { exact: true }).nth(0).selectOption('0')
  await expect(dates.nth(0)).toHaveValue('2027-01-04')
  await expect(times.nth(0)).toHaveValue('09:00')
  await dates.nth(1).fill('2027-01-04')
  await times.nth(1).fill('09:00')
  await page.getByRole('button', { name: 'Create planned workshops' }).click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText('overlapping')
  await expect(dates.nth(0)).toHaveValue('2027-01-04')
  await expect(dates.nth(1)).toHaveValue('2027-01-04')
  expect(await prisma.workshop.count()).toBe(0)
  await times.nth(1).fill('11:00')
  await page.getByRole('button', { name: 'Create planned workshops' }).click()
  await expect(page).toHaveURL(/batch=/)
  expect(await prisma.workshop.count()).toBe(2)
})
test('ad hoc creation uses class defaults, keeps invalid input and handles missing filters', async ({
  page,
}) => {
  const f = await resetFixtures()
  await prisma.classSection.update({
    where: { id: f.cls.id },
    data: { defaultDurationMinutes: 90, defaultMinPAs: 2, defaultMaxPAs: 4 },
  })
  await login(page, f.admin.email, 'admin')
  await page.goto('/admin/workshops?month=2027-01&schoolId=missing&classSectionId=missing')
  await expect(page.getByRole('main').getByRole('alert')).toContainText('filter was cleared')
  await page.getByRole('link', { name: 'Book workshop', exact: true }).click()
  await page.getByLabel('Use a saved class').selectOption(f.cls.id)
  await page.getByText('Advanced staffing', { exact: true }).click()
  await expect(page.getByLabel('Minimum PAs', { exact: true })).toHaveValue('2')
  await expect(page.getByLabel('Maximum PAs', { exact: true })).toHaveValue('4')
  await page.getByLabel('Vancouver date').fill('2027-01-04')
  await page.getByLabel('Start time', { exact: true }).fill('09:00')
  await expect(page.getByLabel('End time', { exact: true })).toHaveValue('10:30')
  await page.getByLabel('End time', { exact: true }).fill('08:00')
  await page.getByRole('button', { name: 'Book workshop', exact: true }).click()
  await expect(page.getByRole('main').getByRole('alert').last()).toContainText(
    'End time must be after'
  )
  await expect(page.getByLabel('End time', { exact: true })).toHaveValue('08:00')
  await page.getByLabel('End time', { exact: true }).fill('10:30')
  await page.getByRole('button', { name: 'Book workshop', exact: true }).click()
  await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible()
})
