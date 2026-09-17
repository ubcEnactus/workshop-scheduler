import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { prisma } from '../../src/lib/db'
import { resetFixtures } from '../fixtures'
import { login } from './helpers'

test.afterAll(async () => {
  await prisma.$disconnect()
})

async function fillConfirmedTime(page: Page, date: string) {
  await page.getByLabel('Vancouver date').fill(date)
  await page.getByLabel('Start time', { exact: true }).fill('10:00')
  await page.getByLabel('End time', { exact: true }).fill('11:00')
}

test('books from an empty foundation and reuses the saved class for the next booking', async ({
  page,
}) => {
  const fixtures = await resetFixtures()
  await prisma.user.updateMany({ where: { role: 'TEACHER' }, data: { deletedAt: new Date() } })
  await prisma.school.updateMany({ data: { deletedAt: new Date() } })
  await login(page, fixtures.admin.email, 'admin')

  await page.goto('/admin/workshops/new?month=2027-03')
  await expect(page.getByLabel('Use a saved class')).toHaveValue('__new__')
  await expect(page.getByLabel('Choose or add a school')).toHaveValue('__new__')
  await expect(page.getByLabel('Choose or add a teacher')).toHaveValue('__new__')
  await page.getByLabel('School name').fill('Direct Booking School')
  await page.getByLabel('School district (optional)').fill('')
  await page.getByLabel('Teacher name').fill('Morgan Teacher')
  await page.getByLabel('Teacher email').fill('morgan.direct@fixture.local')
  await page.getByLabel('Class name').fill('Environmental Science 10')
  await fillConfirmedTime(page, '2027-03-03')
  await page.screenshot({ path: 'work/direct-booking-desktop.png', fullPage: true })

  await page.getByRole('button', { name: 'Book workshop' }).click()
  await expect(page.getByRole('status')).toHaveText('Draft saved.')
  const first = await prisma.workshop.findFirstOrThrow({
    where: { classSection: { name: 'Environmental Science 10' } },
    include: {
      classSection: { include: { school: true, teacher: true, meetings: true } },
    },
  })
  expect(first.hostingConfirmed).toBe(true)
  expect(first.classSection.school.name).toBe('Direct Booking School')
  expect(first.classSection.school.district).toBe('')
  expect(first.classSection.teacher.email).toBe('morgan.direct@fixture.local')
  expect(first.classSection.meetings).toHaveLength(0)

  await page.goto('/admin/workshops/new?month=2027-03')
  await page.getByLabel('Use a saved class').selectOption(first.classSectionId)
  await expect(page.getByLabel('Use a saved class')).toHaveValue(first.classSectionId)
  await fillConfirmedTime(page, '2027-03-04')
  await page.getByRole('button', { name: 'Book workshop' }).click()
  await expect(page.getByRole('status')).toHaveText('Draft saved.')
  expect(await prisma.workshop.count({ where: { classSectionId: first.classSectionId } })).toBe(2)
})

test('keeps relationships consistent, retains invalid entries, and focuses the first error', async ({
  page,
}) => {
  const fixtures = await resetFixtures()
  await prisma.classSection.update({
    where: { id: fixtures.cls.id },
    data: { defaultDurationMinutes: 75, defaultMinPAs: 2, defaultMaxPAs: 4 },
  })
  await login(page, fixtures.admin.email, 'admin')
  await page.goto('/admin/workshops/new?month=2027-04')

  await page.getByLabel('Use a saved class').selectOption(fixtures.cls.id)
  await page.getByText('Advanced staffing').click()
  await expect(page.getByLabel('Minimum PAs')).toHaveValue('2')
  await expect(page.getByLabel('Maximum PAs')).toHaveValue('4')

  await page.getByLabel('Use a saved class').selectOption('__new__')
  await page.getByLabel('Choose or add a school').selectOption(fixtures.school.id)
  await page.getByLabel('Choose or add a teacher').selectOption(fixtures.teacher.id)
  await page.getByLabel('Class name').fill('Direct Booking Physics')
  await page.getByLabel('Choose or add a school').selectOption(fixtures.otherSchool.id)
  await expect(page.getByLabel('Choose or add a teacher')).toHaveValue('__new__')
  await expect(page.getByLabel('Class name')).toHaveValue('')

  await page.getByLabel('Choose or add a school').selectOption(fixtures.school.id)
  await page.getByLabel('Choose or add a teacher').selectOption(fixtures.teacher.id)
  await page.getByLabel('Class name').fill('Direct Booking Physics')
  await page.getByLabel('Vancouver date').fill('2027-04-05')
  await page.getByLabel('Start time', { exact: true }).fill('11:00')
  await expect(page.getByLabel('End time', { exact: true })).toHaveValue('12:00')
  await page.getByLabel('End time', { exact: true }).fill('10:00')
  await page.getByRole('button', { name: 'Book workshop' }).click()

  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Your entries have been kept.'
  )
  await expect(page.getByLabel('Class name')).toHaveValue('Direct Booking Physics')
  await expect(page.getByLabel('Vancouver date')).toHaveValue('2027-04-05')
  await expect(page.getByLabel('End time', { exact: true })).toHaveValue('10:00')
  await expect(page.getByLabel('End time', { exact: true })).toBeFocused()
  await expect(page.locator('#booking-error-endTime')).toBeVisible()

  await page.getByLabel('End time', { exact: true }).fill('12:00')
  await page.getByLabel('Minimum PAs').fill('4')
  await page.getByLabel('Maximum PAs').fill('3')
  await page.getByText('Advanced staffing').click()
  await expect(page.getByText('Advanced staffing').locator('..')).not.toHaveAttribute('open', '')
  await page.getByRole('button', { name: 'Book workshop' }).click()
  await expect(page.getByText('Advanced staffing').locator('..')).toHaveAttribute('open', '')
  await expect(page.getByLabel('Maximum PAs')).toBeFocused()
  await expect(page.locator('#booking-error-maxPAs')).toBeVisible()

  await page.getByLabel('Maximum PAs').fill('4')
  await page.getByRole('button', { name: 'Book workshop' }).click()
  await expect(page.getByRole('status')).toHaveText('Draft saved.')
  const created = await prisma.classSection.findFirstOrThrow({
    where: { name: 'Direct Booking Physics' },
  })
  expect(created.schoolId).toBe(fixtures.school.id)
  expect(created.teacherId).toBe(fixtures.teacher.id)
})

test('prevents a repeated submit and stays accessible without mobile overflow', async ({
  page,
}) => {
  const fixtures = await resetFixtures()
  await prisma.classSection.update({
    where: { id: fixtures.cls.id },
    data: { defaultDurationMinutes: 90 },
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, fixtures.admin.email, 'admin')
  await page.goto('/admin/classes?month=2027-05')
  await page.getByRole('button', { name: 'Open navigation' }).click()
  const navigation = page.getByRole('dialog', { name: 'Navigation menu' })
  await expect(navigation.getByRole('link', { name: 'Classes & teachers' })).toHaveCount(1)
  await expect(navigation.getByRole('link', { name: 'Tasks' })).toHaveCount(0)
  await navigation.getByRole('button', { name: 'Close navigation' }).click()
  await page.getByRole('link', { name: 'Book Fixture Biology' }).click()
  await expect(page).toHaveURL(/\/admin\/workshops\/new/)
  await expect(page.getByLabel('Use a saved class')).toHaveValue(fixtures.cls.id)
  await page.getByLabel('Vancouver date').fill('2027-05-03')
  await page.getByLabel('Start time', { exact: true }).fill('10:00')
  await expect(page.getByLabel('End time', { exact: true })).toHaveValue('11:30')
  await page.getByRole('button', { name: 'Book workshop' }).dblclick()
  await expect(page.getByRole('status')).toHaveText('Draft saved.')
  expect(
    await prisma.workshop.count({
      where: { classSectionId: fixtures.cls.id, hostingConfirmed: true },
    })
  ).toBe(1)

  await page.goto('/admin/workshops/new?month=2027-05')
  await expect(page.getByLabel('School name')).toBeVisible()
  await expect(page.getByLabel('Teacher name')).toBeVisible()
  await expect(page.getByLabel('Class name')).toBeVisible()
  await page.screenshot({ path: 'work/direct-booking-mobile.png', fullPage: true })
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(results.violations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
