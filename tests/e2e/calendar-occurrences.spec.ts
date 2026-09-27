import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { prisma } from '../../src/lib/db'
import { resetFixtures, createSessionFixture } from '../fixtures'
import { vancouverToUtc } from '../../src/lib/time'
import { login } from './helpers'

test.afterAll(() => prisma.$disconnect())

test('removes and restores a weekly occurrence with durable feedback, grouped ranges and mobile access', async ({
  page,
}) => {
  const f = await resetFixtures()
  await prisma.schoolClosure.create({
    data: {
      schoolId: f.school.id,
      date: new Date('2027-01-04'),
      startMinute: 600,
      endMinute: 660,
      notes: 'Assembly',
    },
  })
  await login(page, f.admin.email, 'admin')
  await page.goto(`/admin/classes/${f.cls.id}?month=2027-01`)
  const selected = page.getByLabel('Selected date', { exact: true })
  const monday = page.getByRole('button', { name: /Monday, January 4, 2027;/ })
  await monday.click()
  await expect(
    page.getByText('Date-specific changes and school closures', { exact: true })
  ).toHaveCount(0)
  await expect(page.getByText('Add a school-wide closure', { exact: true })).toHaveCount(0)
  await expect(monday).toHaveAccessibleName(/1 available time;/)
  await expect(selected.getByText('Weekly availability', { exact: true })).toHaveCount(1)
  await expect(selected.getByText('9:00–10:00 AM', { exact: true })).toBeVisible()
  await expect(selected.getByText('11:00 AM–12:00 PM', { exact: true })).toBeVisible()
  await selected.getByRole('button', { name: 'Remove for this date', exact: true }).click()
  await expect(selected.getByText('Removed for this date', { exact: true })).toBeVisible()
  await expect(selected.getByRole('status')).toHaveText('Availability removed for this date.')
  await expect(selected.getByRole('status')).toBeFocused()
  await expect(monday).toHaveAccessibleName(/0 available times;/)
  await expect(
    page.getByRole('button', { name: /Monday, January 11, 2027;/ })
  ).toHaveAccessibleName(/1 available time;/)
  await selected.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(selected.getByRole('status')).toHaveText('Availability restored for this date.')
  await expect(monday).toHaveAccessibleName(/1 available time;/)
  await selected.getByRole('button', { name: 'Remove for this date', exact: true }).click()
  await expect(selected.getByRole('button', { name: 'Undo', exact: true })).toBeVisible()
  await page.reload()
  await monday.click()
  await expect(selected.getByRole('button', { name: 'Restore', exact: true })).toBeVisible()
  await selected.getByLabel('Start time', { exact: true }).fill('13:00')
  await selected.getByLabel('End time', { exact: true }).fill('14:00')
  await selected.getByRole('button', { name: 'Add availability', exact: true }).click()
  await expect(monday).toHaveAccessibleName(/1 available time;/)
  await expect(selected.getByText('Removed for this date', { exact: true })).toBeVisible()
  await expect(selected.getByText('Unavailable', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'work/calendar-occurrences-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations
  ).toEqual([])
  await page.screenshot({ path: 'work/calendar-occurrences-mobile.png', fullPage: true })
  await selected.getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(monday).toHaveAccessibleName(/2 available times;/)
  await selected
    .getByRole('button', { name: 'Reopen for all teachers at this school', exact: true })
    .click()
  await expect(selected.getByText('Unavailable', { exact: true })).toHaveCount(0)
  expect(await prisma.schoolClosure.count()).toBe(0)
})

test('a booked weekly occurrence links to its session and stays available', async ({ page }) => {
  const f = await resetFixtures()
  const session = await createSessionFixture({
    data: {
      classSectionId: f.cls.id,
      scheduledStart: vancouverToUtc('2027-01-04', 600),
      scheduledEnd: vancouverToUtc('2027-01-04', 660),
      minPAs: 1,
      maxPAs: 2,
      mode: 'IN_PERSON',
    },
  })
  await login(page, f.admin.email, 'admin')
  await page.goto(`/admin/classes/${f.cls.id}?month=2027-01`)
  await page.getByRole('button', { name: /Monday, January 4, 2027;/ }).click()
  const selected = page.getByLabel('Selected date', { exact: true })
  await selected.getByRole('button', { name: 'Remove for this date', exact: true }).click()
  await expect(selected.getByRole('alert')).toContainText('booked session')
  await expect(
    selected.getByRole('link', { name: 'Manage session first', exact: true })
  ).toHaveAttribute('href', `/admin/workshops/${session.id}`)
  await expect(selected.getByText('Weekly availability', { exact: true })).toBeVisible()
  expect(await prisma.classMeetingSkip.count()).toBe(0)
})
