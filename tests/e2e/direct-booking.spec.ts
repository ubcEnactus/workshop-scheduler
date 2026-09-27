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
  await page.getByLabel('Workshop', { exact: true }).selectOption('fixture-definition-1')
  await expect(page.getByLabel('Use a saved class')).toHaveCount(0)
  await expect(page.getByLabel('Choose or add a school')).toHaveValue('__new__')
  await expect(page.getByLabel('Choose or add a teacher')).toHaveValue('__new__')
  await page.getByLabel('School name').fill('Direct Booking School')
  await page.getByLabel('Teacher name').fill('Morgan Teacher')
  await page.getByLabel('Teacher email').fill('morgan.direct@fixture.local')
  await fillConfirmedTime(page, '2027-03-03')
  await page.screenshot({ path: 'work/direct-booking-desktop.png', fullPage: true })

  await page.getByRole('button', { name: 'Schedule teacher session' }).click()
  await expect(page.getByRole('status')).toHaveText('Draft saved.')
  const first = await prisma.workshopSession.findFirstOrThrow({
    where: { classWorkshop: { classSection: { name: 'Morgan Teacher' } } },
    include: {
      classWorkshop: {
        include: { classSection: { include: { school: true, teacher: true, meetings: true } } },
      },
    },
  })
  expect(first.hostingConfirmed).toBe(true)
  expect(first.classWorkshop.classSection.school.name).toBe('Direct Booking School')
  expect(first.classWorkshop.classSection.teacher.email).toBe('morgan.direct@fixture.local')
  expect(first.classWorkshop.classSection.meetings).toHaveLength(0)

  await page.goto('/admin/workshops/new?month=2027-03')
  await page.getByLabel('Workshop', { exact: true }).selectOption('fixture-definition-1')
  await page
    .getByLabel('Choose or add a school')
    .selectOption(first.classWorkshop.classSection.schoolId)
  await page
    .getByLabel('Choose or add a teacher')
    .selectOption(first.classWorkshop.classSection.teacherId)
  await expect(page.getByLabel('Use a saved class')).toHaveCount(0)
  await page.getByLabel('Workshop', { exact: true }).selectOption('fixture-definition-2')
  await fillConfirmedTime(page, '2027-03-04')
  await page.getByRole('button', { name: 'Schedule teacher session' }).click()
  await expect(page.getByRole('status')).toHaveText('Draft saved.')
  expect(
    await prisma.workshopSession.count({
      where: { classWorkshop: { classSectionId: first.classWorkshop.classSectionId } },
    })
  ).toBe(2)
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
  await page.getByLabel('Workshop', { exact: true }).selectOption('fixture-definition-1')

  await page.getByLabel('Choose or add a school').selectOption(fixtures.school.id)
  await page.getByLabel('Choose or add a teacher').selectOption(fixtures.teacher.id)
  await page.getByText('Advanced staffing').click()
  await expect(page.getByLabel('Minimum PAs')).toHaveValue('1')
  await expect(page.getByLabel('Maximum PAs')).toHaveValue('3')

  await page.getByLabel('Choose or add a school').selectOption(fixtures.school.id)
  await page.getByLabel('Choose or add a teacher').selectOption(fixtures.teacher.id)
  await page.getByLabel('Choose or add a school').selectOption(fixtures.otherSchool.id)
  await expect(page.getByLabel('Choose or add a teacher')).toHaveValue('')
  await expect(page.getByLabel('Class label (optional)')).toHaveCount(0)

  await page.getByLabel('Choose or add a school').selectOption(fixtures.school.id)
  await page.getByLabel('Choose or add a teacher').selectOption(fixtures.teacher.id)
  await page.getByLabel('Vancouver date').fill('2027-04-05')
  await page.getByLabel('Start time', { exact: true }).fill('11:00')
  await expect(page.getByLabel('End time', { exact: true })).toHaveValue('12:00')
  await page.getByLabel('End time', { exact: true }).fill('10:00')
  await page.getByRole('button', { name: 'Schedule teacher session' }).click()

  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Your entries have been kept.'
  )
  await expect(page.getByLabel('Class label (optional)')).toHaveCount(0)
  await expect(page.getByLabel('Vancouver date')).toHaveValue('2027-04-05')
  await expect(page.getByLabel('End time', { exact: true })).toHaveValue('10:00')
  await expect(page.getByLabel('End time', { exact: true })).toBeFocused()
  await expect(page.locator('#booking-error-endTime')).toBeVisible()

  await page.getByLabel('End time', { exact: true }).fill('12:00')
  await page.getByLabel('Minimum PAs').fill('4')
  await page.getByLabel('Maximum PAs').fill('3')
  await page.getByText('Advanced staffing').click()
  await expect(page.getByText('Advanced staffing').locator('..')).not.toHaveAttribute('open', '')
  await page.getByRole('button', { name: 'Schedule teacher session' }).click()
  await expect(page.getByText('Advanced staffing').locator('..')).toHaveAttribute('open', '')
  await expect(page.getByLabel('Maximum PAs')).toBeFocused()
  await expect(page.locator('#booking-error-maxPAs')).toBeVisible()

  await page.getByLabel('Maximum PAs').fill('4')
  await page.getByRole('button', { name: 'Schedule teacher session' }).click()
  await expect(page.getByRole('status')).toHaveText('Draft saved.')
  const created = await prisma.classSection.findFirstOrThrow({
    where: { teacherId: fixtures.teacher.id },
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
  await page.goto('/admin/teachers?month=2027-05')
  await page.getByRole('button', { name: 'Open navigation' }).click()
  const navigation = page.getByRole('dialog', { name: 'Navigation menu' })
  await expect(
    navigation.getByRole('link', { name: 'Schools & teachers', exact: true })
  ).toHaveCount(1)
  await expect(navigation.getByRole('link', { name: 'Teachers', exact: true })).toHaveCount(0)
  await expect(navigation.getByRole('link', { name: 'Tasks' })).toHaveCount(0)
  await navigation.getByRole('button', { name: 'Close navigation' }).click()
  await page.goto('/admin/workshops/new?teacherId=' + fixtures.teacher.id)
  await page.getByLabel('Workshop', { exact: true }).selectOption('fixture-definition-1')
  await expect(page).toHaveURL(/\/admin\/workshops\/new/)
  await expect(page.getByLabel('Use a saved class')).toHaveCount(0)
  await page.getByLabel('Vancouver date').fill('2027-05-03')
  await page.getByLabel('Start time', { exact: true }).fill('10:00')
  await expect(page.getByLabel('End time', { exact: true })).toHaveValue('11:00')
  await page.getByRole('button', { name: 'Schedule teacher session' }).dblclick()
  await expect(page.getByRole('status')).toHaveText('Draft saved.')
  expect(
    await prisma.workshopSession.count({
      where: { classWorkshop: { classSectionId: fixtures.cls.id }, hostingConfirmed: true },
    })
  ).toBe(1)

  await page.goto('/admin/workshops/new?month=2027-05')
  await page.getByLabel('Workshop', { exact: true }).selectOption('fixture-definition-1')
  await expect(page.getByLabel('Choose or add a school')).toHaveValue('')
  await expect(page.getByLabel('Choose or add a teacher')).toBeDisabled()
  await page.getByLabel('Choose or add a school').selectOption('__new__')
  await expect(page.getByLabel('School name')).toBeVisible()
  await expect(page.getByLabel('Teacher name')).toBeVisible()
  await expect(page.getByLabel('Class label (optional)')).toHaveCount(0)
  await page.screenshot({ path: 'work/direct-booking-mobile.png', fullPage: true })
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(results.violations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('weekly availability is visible and does not book a date until the admin books', async ({
  page,
}) => {
  const f = await resetFixtures()
  await login(page, f.admin.email, 'admin')
  await page.goto('/admin/teachers/' + f.teacher.id + '?month=2027-03')
  await expect(
    page.getByText('Saving availability does not schedule a session.', { exact: false })
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Return to run planning' })).toHaveCount(0)
  await page.getByText('Add weekly time', { exact: true }).click()
  const recurringForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Save weekly time', exact: true }) })
  await recurringForm.getByLabel('Weekday', { exact: true }).selectOption('2')
  await recurringForm.getByLabel('From', { exact: true }).fill('13:00')
  await recurringForm.getByLabel('Until', { exact: true }).fill('14:00')
  await recurringForm.getByRole('button', { name: 'Save weekly time', exact: true }).click()
  await expect(page.getByText(/Wednesday · 1:00–2:00 PM · Used for date suggestions/)).toBeVisible()
  expect(await prisma.workshopSession.count()).toBe(0)
  await page.goto('/admin/workshops/new?teacherId=' + f.teacher.id)
  await page.getByLabel('Workshop', { exact: true }).selectOption('fixture-definition-1')
  await expect(page.getByLabel('Use a saved class')).toHaveCount(0)
  await expect(page.getByText('Wednesday · 1:00–2:00 PM', { exact: true })).toBeVisible()
  await fillConfirmedTime(page, '2027-03-03')
  await page.getByRole('button', { name: 'Schedule teacher session', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Draft saved.')
  await page.getByRole('link', { name: 'Assign PAs to this teacher session' }).click()
  await expect(page).toHaveURL(/#workshop-staffing$/)
  await expect(page.getByRole('heading', { name: 'Staffing', exact: true })).toBeInViewport()
  expect(await prisma.workshopSession.count()).toBe(1)
})

test('books from a teacher contact without requiring class setup and summarizes the selected time', async ({
  page,
}) => {
  const f = await resetFixtures()
  await login(page, f.admin.email, 'admin')
  await page.goto('/admin/workshops/new?teacherId=' + f.otherTeacher.id)
  await page.getByLabel('Workshop', { exact: true }).selectOption('fixture-definition-1')
  await expect(page.getByLabel('Choose or add a school')).toHaveValue(f.otherSchool.id)
  await expect(page.getByLabel('Choose or add a teacher')).toHaveValue(f.otherTeacher.id)
  await expect(page.getByLabel('Class label (optional)')).toHaveCount(0)
  await page.getByLabel('Vancouver date').fill('2027-03-03')
  await page.getByLabel('Start time', { exact: true }).fill('10:00')
  await expect(page.getByLabel('End time', { exact: true })).toHaveValue('11:00')
  const summary = page.getByRole('complementary', { name: 'Teacher session summary' })
  await expect(summary).toContainText('Mar 3, 2027')
  await expect(summary).toContainText('10:00–11:00 AM')
  await expect(summary).toContainText('Other Teacher')
  await page.getByRole('button', { name: 'Schedule teacher session', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Draft saved.')
  const created = await prisma.workshopSession.findFirstOrThrow({
    include: { classWorkshop: { include: { classSection: true } } },
  })
  expect(created.classWorkshop.classSection).toMatchObject({
    name: f.otherTeacher.name,
    teacherId: f.otherTeacher.id,
    schoolId: f.otherSchool.id,
  })

  // A teacher with one saved group should not accidentally get a duplicate.
  await prisma.classSection.update({
    where: { id: created.classWorkshop.classSectionId },
    data: { name: 'Grade 4', defaultDurationMinutes: 75 },
  })
  await page.goto('/admin/workshops/new?teacherId=' + f.otherTeacher.id)
  await page.getByLabel('Workshop', { exact: true }).selectOption('fixture-definition-1')
  await expect(page.getByLabel('Use a saved class')).toHaveCount(0)
  await page.getByLabel('Start time', { exact: true }).fill('10:00')
  await expect(page.getByLabel('End time', { exact: true })).toHaveValue('11:00')
  await page.goto('/admin/workshops/new?month=2027-03')
  await page.getByLabel('Workshop', { exact: true }).selectOption('fixture-definition-1')
  await page.getByLabel('Choose or add a school').selectOption(f.otherSchool.id)
  await page.getByLabel('Choose or add a teacher').selectOption(f.otherTeacher.id)
  await expect(page.getByLabel('Use a saved class')).toHaveCount(0)
  await expect(page.getByLabel('Class label (optional)')).toHaveCount(0)
})

test('switching hosts resets automatic duration but preserves an explicitly edited end time', async ({
  page,
}) => {
  const f = await resetFixtures()
  await prisma.classSection.update({
    where: { id: f.cls.id },
    data: { defaultDurationMinutes: 90 },
  })
  await login(page, f.admin.email, 'admin')
  await page.goto('/admin/workshops/new?month=2027-03')
  await page.getByLabel('Workshop', { exact: true }).selectOption('fixture-definition-1')
  await page.getByLabel('Choose or add a school').selectOption(f.school.id)
  await page.getByLabel('Choose or add a teacher').selectOption(f.teacher.id)
  await page.getByLabel('Start time', { exact: true }).fill('10:00')
  await expect(page.getByLabel('End time', { exact: true })).toHaveValue('11:00')
  await page.getByLabel('Choose or add a school').selectOption(f.otherSchool.id)
  await expect(page.getByLabel('End time', { exact: true })).toHaveValue('11:00')
  await page.getByLabel('End time', { exact: true }).fill('12:00')
  await page.getByLabel('Choose or add a school').selectOption(f.school.id)
  await page.getByLabel('Choose or add a teacher').selectOption(f.teacher.id)
  await expect(page.getByLabel('End time', { exact: true })).toHaveValue('12:00')
})
