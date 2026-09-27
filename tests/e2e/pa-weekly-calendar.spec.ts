import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { prisma } from '../../src/lib/db'
import { resetFixtures, createSessionFixture } from '../fixtures'
import { vancouverToUtc } from '../../src/lib/time'
import { login } from './helpers'

test.afterAll(() => prisma.$disconnect())

test('admin adds and removes dated PA time directly from the selected calendar day', async ({
  page,
}) => {
  const f = await resetFixtures()
  await login(page, f.admin.email, 'admin')
  await page.goto(`/admin/pas/${f.pa.id}/availability?month=2027-01`)
  await expect(page.getByLabel('This weekly schedule takes effect')).toHaveCount(0)
  await expect(page.getByText('One-off availability exceptions', { exact: true })).toHaveCount(0)
  const calendar = page.getByRole('region', { name: 'Availability calendar' })
  const selected = calendar.getByRole('complementary', { name: 'Selected date' })
  const form = selected.getByRole('form', { name: 'Add availability for selected date' })
  await calendar.getByRole('button', { name: /Wednesday, January 6, 2027;/ }).click()
  await form.getByLabel('Start time').fill('10:30')
  await form.getByLabel('End time').fill('09:30')
  await form.getByRole('button', { name: 'Add availability', exact: true }).click()
  await expect(form.getByRole('alert')).toBeVisible()
  expect(await prisma.pAAvailabilityException.count()).toBe(0)
  await form.getByLabel('Start time').fill('09:30')
  await form.getByLabel('End time').fill('10:30')
  await form.getByRole('button', { name: 'Add availability', exact: true }).click()
  await expect(selected.getByText('ADDED FOR THIS DATE', { exact: true })).toBeVisible()
  await expect
    .poll(() =>
      prisma.pAAvailabilityException.count({
        where: {
          userId: f.pa.id,
          date: new Date('2027-01-06'),
          startMinute: 570,
          endMinute: 630,
          kind: 'AVAILABLE',
        },
      })
    )
    .toBe(1)
  await calendar.getByRole('button', { name: /Thursday, January 7, 2027;/ }).click()
  await expect(selected.getByText('ADDED FOR THIS DATE', { exact: true })).toHaveCount(0)
  await form.getByRole('button', { name: 'Add availability', exact: true }).click()
  await expect(selected.getByText('ADDED FOR THIS DATE', { exact: true })).toBeVisible()
  await page.reload()
  await calendar.getByRole('button', { name: /Wednesday, January 6, 2027;/ }).click()
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations
    ).toEqual([])
    await page.screenshot({ path: `work/admin-pa-current-calendar-${width}.png`, fullPage: true })
  }
  await selected.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(selected.getByText('ADDED FOR THIS DATE', { exact: true })).toHaveCount(0)
  const remaining = await prisma.pAAvailabilityException.findMany()
  expect(remaining).toHaveLength(1)
  expect(remaining[0].date).toEqual(new Date('2027-01-07'))
  expect(await prisma.availability.count()).toBe(0)
})

test('PA saves selected weekdays and sees a read-only calendar with published assignments only', async ({
  page,
}) => {
  const f = await resetFixtures()
  await createSessionFixture({
    data: {
      classSectionId: f.cls.id,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      scheduledStart: vancouverToUtc('2027-01-06', 600),
      scheduledEnd: vancouverToUtc('2027-01-06', 660),
      assignments: { create: { paId: f.pa.id, status: 'PUBLISHED' } },
    },
  })
  const draft = await createSessionFixture({
    data: {
      classSectionId: f.sibling.id,
      status: 'DRAFT',
      scheduledStart: vancouverToUtc('2027-01-06', 720),
      scheduledEnd: vancouverToUtc('2027-01-06', 780),
      assignments: { create: { paId: f.pa.id, status: 'DRAFT' } },
    },
  })
  await prisma.classWorkshop.update({
    where: { id: draft.classWorkshopId },
    data: { workshopDefinition: { update: { title: 'Private draft workshop' } } },
  })
  await login(page, f.pa.email, 'pa')
  await page.goto('/pa/availability?month=2027-01')
  const editor = page.getByRole('region', { name: 'Availability editor' })
  await expect(editor.getByRole('checkbox')).toHaveCount(5)
  await expect(editor.getByRole('button', { name: 'Monday', exact: true })).toHaveCount(0)
  await expect(
    page.getByText(/Copy Monday|One-off availability|Edit individual 15-minute slots/)
  ).toHaveCount(0)
  await editor.getByRole('checkbox', { name: 'Monday', exact: true }).uncheck()
  await editor.getByRole('button', { name: 'Add time range', exact: true }).click()
  await expect(editor.getByRole('alert')).toContainText('Select at least one weekday')
  await editor.getByRole('checkbox', { name: 'Wednesday', exact: true }).check()
  await editor.getByRole('checkbox', { name: 'Friday', exact: true }).press('Space')
  await editor.getByLabel('From', { exact: true }).selectOption('540')
  await editor.getByLabel('Until', { exact: true }).selectOption('720')
  await editor.getByRole('button', { name: 'Add time range', exact: true }).click()
  const calendar = page.getByRole('region', { name: 'Availability calendar' })
  await calendar.getByRole('button', { name: /Wednesday, January 6, 2027;/ }).click()
  const selected = calendar.getByRole('complementary', { name: 'Selected date' })
  await expect(selected.getByText('AVAILABLE', { exact: true })).toHaveCount(0)
  await expect(selected.getByText('PUBLISHED WORKSHOP', { exact: true })).toBeVisible()
  await expect(page.getByText('Private draft workshop', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('This weekly schedule takes effect')).toHaveCount(0)
  await page.getByRole('button', { name: 'Save availability', exact: true }).click()
  await expect(page.getByText('Availability saved.', { exact: true })).toBeVisible()
  await expect.poll(() => prisma.availability.count({ where: { userId: f.pa.id } })).toBe(24)
  await page.goto('/pa/availability?month=2027-01')
  await calendar.getByRole('button', { name: /Wednesday, January 6, 2027;/ }).click()
  await expect(selected.getByText('9:00 AM–12:00 PM', { exact: true })).toBeVisible()
  await expect(selected.getByRole('button')).toHaveCount(0)
  await expect(calendar.locator('form')).toHaveCount(0)
  await calendar.getByRole('link', { name: 'Previous month' }).click()
  await expect(calendar.getByRole('heading', { name: 'December 2026', exact: true })).toBeVisible()
  await calendar.getByRole('button', { name: /Wednesday, December 30, 2026;/ }).click()
  await expect(selected.getByText('9:00 AM–12:00 PM', { exact: true })).toBeVisible()
  await calendar.getByRole('link', { name: 'Next month' }).click()
  await expect(calendar.getByRole('heading', { name: 'January 2027', exact: true })).toBeVisible()
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations
    ).toEqual([])
    await page.getByRole('heading', { name: 'Weekly availability', exact: true }).first().click()
    await page.screenshot({ path: `work/pa-weekly-calendar-${width}.png`, fullPage: true })
  }
})
