import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { prisma } from '../../src/lib/db'
import { resetFixtures } from '../fixtures'
import { login } from './helpers'

test.afterAll(() => prisma.$disconnect())

test('sets a shared window and schedules from a class calendar on desktop and mobile', async ({
  page,
}) => {
  const f = await resetFixtures()
  await login(page, f.admin.email, 'admin')
  await page.goto('/admin/workshop-definitions')
  const definitionCard = page
    .getByRole('heading', { name: 'Workshop 1', exact: true })
    .locator('xpath=ancestor::section[1]')
  await definitionCard.getByText('Edit workshop details', { exact: true }).click()
  const definitionForm = definitionCard
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Save workshop details', exact: true }) })
  await definitionForm.locator('input[name="deliveryStart"]').fill('2027-01-04')
  await definitionForm.locator('input[name="deliveryEnd"]').fill('2027-01-08')
  await definitionForm.getByRole('button', { name: 'Save workshop details' }).click()
  await expect(definitionCard.getByText(/Jan 4–8, 2027/)).toBeVisible()
  await prisma.classAvailabilityException.create({
    data: {
      classSectionId: f.cls.id,
      date: new Date('2027-01-06T00:00:00.000Z'),
      kind: 'ADDITIONAL',
      startMinute: 780,
      endMinute: 840,
      notes: 'Teacher added this afternoon',
    },
  })
  await prisma.schoolClosure.create({
    data: {
      schoolId: f.school.id,
      date: new Date('2027-01-05T00:00:00.000Z'),
      startMinute: 600,
      endMinute: 660,
      notes: 'Assembly',
    },
  })
  await page.goto('/admin/classes/' + f.cls.id + '?month=2027-01')
  const selected = page.getByLabel('Selected date', { exact: true })
  await expect(
    page.getByRole('button', { name: /Monday, January 4, 2027; 1 available time;/ })
  ).toBeVisible()
  await page.getByRole('button', { name: /Monday, January 4, 2027;/ }).click()
  await expect(selected.getByText('Weekly availability', { exact: true })).toBeVisible()
  await expect(selected.getByText('9:00 AM–12:00 PM', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Tuesday, January 5, 2027;/ }).click()
  await expect(selected.getByText('Weekly availability', { exact: true })).toHaveCount(1)
  await expect(selected.getByText('Unavailable', { exact: true })).toBeVisible()
  await expect(selected.getByText(/School closure/)).toBeVisible()
  await page.getByRole('button', { name: /Wednesday, January 6, 2027;/ }).click()
  await expect(selected.getByText('Extra availability', { exact: true })).toBeVisible()
  await expect(selected.getByText('Teacher added this afternoon', { exact: true })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Teacher sections' })
    .getByRole('link', { name: 'Workshops', exact: true })
    .click()
  await page.getByLabel('Workshop', { exact: true }).selectOption('fixture-definition-1')
  await page.getByRole('button', { name: 'Add workshop to teacher' }).click()
  await expect(page).toHaveURL(/month=2027-01/)
  await page
    .getByRole('navigation', { name: 'Teacher sections' })
    .getByRole('link', { name: 'Availability', exact: true })
    .click()
  await page.getByLabel('Show delivery window').selectOption({ label: 'Workshop 1' })
  await expect(page.getByText('2027-01-04 through 2027-01-08', { exact: false })).toBeVisible()
  for (const day of [4, 11]) {
    await page.getByRole('button', { name: new RegExp(`Monday, January ${day}, 2027;`) }).click()
    await selected.getByLabel('Start time', { exact: true }).fill('10:00')
    await selected.getByLabel('End time', { exact: true }).fill('12:00')
    await selected.getByLabel('Notes (optional)').fill('Teacher confirmed')
    await selected.getByRole('button', { name: 'Add availability', exact: true }).click()
    await expect(selected.getByRole('status')).toHaveText('Availability saved.')
    await expect(
      page.getByRole('button', {
        name: new RegExp(`January ${day}, 2027; 2 available times;`),
      })
    ).toBeVisible()
  }
  await page
    .getByRole('navigation', { name: 'Teacher sections' })
    .getByRole('link', { name: 'Workshops', exact: true })
    .click()
  const card = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'Workshop 1', exact: true }) })
  await expect(card.getByText('Choose from 1 saved candidate time')).toBeVisible()
  await prisma.workshopDefinition.update({
    where: { id: 'fixture-definition-2' },
    data: {
      deliveryStartsOn: new Date('2027-01-04T00:00:00.000Z'),
      deliveryEndsOn: new Date('2027-01-15T00:00:00.000Z'),
    },
  })
  await page.getByLabel('Workshop', { exact: true }).selectOption('fixture-definition-2')
  await page.getByRole('button', { name: 'Add workshop to teacher' }).click()
  const other = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'Workshop 2', exact: true }) })
  await expect(other.getByText('Choose from 2 saved candidate times')).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Teacher sections' })
    .getByRole('link', { name: 'Availability', exact: true })
    .click()
  await page.getByRole('button', { name: /Monday, January 11, 2027;/ }).click()
  await selected.getByText('Edit availability', { exact: true }).click()
  const edit = selected
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Save availability', exact: true }) })
  await edit.getByLabel('Notes (optional)').fill('Updated teacher note')
  await edit.getByRole('button', { name: 'Save availability' }).click()
  await expect(selected.getByText('Updated teacher note', { exact: true })).toBeVisible()
  await selected.getByRole('button', { name: 'Remove availability', exact: true }).click()
  await page
    .getByRole('navigation', { name: 'Teacher sections' })
    .getByRole('link', { name: 'Workshops', exact: true })
    .click()
  await expect(other.getByText('Choose from 1 saved candidate time')).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Teacher sections' })
    .getByRole('link', { name: 'Availability', exact: true })
    .click()
  await page.getByRole('button', { name: /Monday, January 4, 2027;/ }).click()
  await page.screenshot({ path: 'work/class-calendar-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'work/class-calendar-mobile.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations
  ).toEqual([])
  await page
    .getByRole('navigation', { name: 'Teacher sections' })
    .getByRole('link', { name: 'Workshops', exact: true })
    .click()
  await card.getByText('Choose from 1 saved candidate time').click()
  await expect(card.getByLabel('Session end')).toHaveValue('11:00')
  await card.getByLabel('Location').fill('Room 12')
  await card.getByRole('button', { name: 'Create draft session' }).click()
  await expect(page.getByRole('status')).toHaveText('Draft saved.')
  expect(await prisma.workshopSession.count()).toBe(1)
  await page.goto('/admin/classes/' + f.cls.id + '?month=2027-01')
  await page.getByRole('button', { name: /Monday, January 4, 2027;/ }).click()
  await expect(selected.getByText('Supports a booked session.', { exact: false })).toBeVisible()
  await expect(selected.getByRole('button', { name: 'Remove availability' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Next month', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'February 2027', exact: true })).toBeVisible()
})
