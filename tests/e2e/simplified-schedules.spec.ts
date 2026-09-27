import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { prisma } from '../../src/lib/db'
import { resetFixtures } from '../fixtures'
import { login } from './helpers'
test.afterAll(() => prisma.$disconnect())

test('teacher tabs separate content and weekdays save without activation or copy controls', async ({
  page,
}) => {
  const f = await resetFixtures()
  await login(page, f.admin.email, 'admin')
  await page.goto(`/admin/teachers/${f.teacher.id}?month=2027-01`)
  const nav = page.getByRole('navigation', { name: 'Teacher sections' })
  await expect(nav.getByRole('link')).toHaveCount(2)
  await expect(nav.getByRole('link', { name: 'Availability', exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  )
  await expect(page.getByRole('heading', { name: 'Workshops for this teacher' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Teacher contact', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Edit contact', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Deactivate teacher', exact: true })).toBeVisible()
  await page.getByText('Add weekly time', { exact: true }).click()
  const weekly = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Save weekly time', exact: true }) })
    .last()
  await expect(weekly.getByLabel('Weekday', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Use this time for date suggestions', { exact: true })).toHaveCount(0)
  await weekly.getByText('Monday', { exact: true }).click()
  await weekly.getByText('Wednesday', { exact: true }).click()
  await weekly.getByRole('checkbox', { name: 'Friday', exact: true }).press('Space')
  await expect(weekly.getByRole('checkbox', { name: 'Monday', exact: true })).not.toBeChecked()
  await expect(weekly.getByRole('checkbox', { name: 'Wednesday', exact: true })).toBeChecked()
  await expect(weekly.getByRole('checkbox', { name: 'Friday', exact: true })).toBeChecked()
  await weekly.getByLabel('From', { exact: true }).fill('10:00')
  await weekly.getByLabel('Until', { exact: true }).fill('11:00')
  await weekly.getByRole('button', { name: 'Save weekly time', exact: true }).click()
  await expect(weekly.getByText('Weekly availability saved.', { exact: true })).toBeVisible()
  const added = await prisma.classMeeting.findMany({
    where: { classSectionId: f.cls.id, dayOfWeek: { in: [2, 4] } },
  })
  expect(added.map((item) => item.dayOfWeek).sort()).toEqual([2, 4])
  expect(added.every((item) => item.activeForScheduling)).toBe(true)
  await nav.getByRole('link', { name: 'Workshops', exact: true }).click()
  await expect(page.getByLabel('Teacher availability calendar')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Workshops for this teacher' })).toBeVisible()
  await page.getByLabel('Workshop', { exact: true }).selectOption('fixture-definition-1')
  await page.getByRole('button', { name: 'Add workshop to teacher' }).click()
  await expect(nav.getByRole('link', { name: 'Workshops', exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  )
  await page.reload()
  await expect(nav.getByRole('link', { name: 'Workshops', exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  )
  await nav.getByRole('link', { name: 'Availability', exact: true }).click()
  await page.getByText('Add weekly time', { exact: true }).click()
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations
    ).toEqual([])
    await page.screenshot({ path: `work/simplified-teacher-${width}.png`, fullPage: true })
  }
})

test('admin edits the same PA schedule visible to the PA and cannot overwrite a newer save', async ({
  page,
  browser,
}) => {
  const f = await resetFixtures()
  await login(page, f.admin.email, 'admin')
  await page.goto('/admin/pas')
  await page.getByRole('link', { name: 'Availability for Fixture PA', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/admin/pas/${f.pa.id}/availability$`))
  const url = page.url()
  const stale = await page.context().newPage()
  await stale.goto(url)
  await expect(stale.getByRole('button', { name: 'Save availability', exact: true })).toBeVisible()
  const editor = page.getByRole('region', { name: 'Availability editor' })
  await editor.getByLabel('From', { exact: true }).selectOption('600')
  await editor.getByLabel('Until', { exact: true }).selectOption('660')
  await editor.getByRole('button', { name: 'Add time range', exact: true }).click()
  await page.getByRole('button', { name: 'Save availability', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Availability saved.')
  await stale.getByRole('button', { name: 'Save availability', exact: true }).click()
  await expect(stale.getByRole('main').getByRole('alert')).toContainText('schedule changed')
  expect(await prisma.availability.count({ where: { userId: f.pa.id } })).toBe(4)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations
  ).toEqual([])
  await page.screenshot({ path: 'work/admin-pa-schedule-mobile.png', fullPage: true })
  const context = await browser.newContext()
  const pa = await context.newPage()
  await login(pa, f.pa.email, 'pa')
  await pa.goto('/pa/availability')
  await expect(
    pa.getByRole('button', { name: 'Remove Monday 10:00–11:00 AM', exact: true })
  ).toBeVisible()
  await pa.goto(url)
  await expect(pa).toHaveURL(/\/403$/)
  await context.close()
})
