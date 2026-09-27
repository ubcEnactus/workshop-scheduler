import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { prisma } from '../../src/lib/db'
import { resetFixtures } from '../fixtures'
import { login } from './helpers'

test.afterAll(() => prisma.$disconnect())

test('school and teacher setup leads directly to availability, enrollment and booking', async ({
  page,
}) => {
  const f = await resetFixtures()
  await login(page, f.admin.email, 'admin')
  await page.goto(
    '/admin/classes?workshopDefinitionId=fixture-definition-1&week=2027-01-04&month=2027-01'
  )
  await expect(page).toHaveURL(/\/admin\/teachers\?/)
  await expect(page.getByRole('link', { name: 'Add class', exact: true })).toHaveCount(0)
  await page.getByLabel('Name', { exact: true }).fill('Teacher Only')
  await page.getByLabel('Email', { exact: true }).fill('teacher-only@fixture.local')
  await page.getByLabel('School', { exact: true }).selectOption(f.school.id)
  await page.getByRole('button', { name: 'Add teacher', exact: true }).click()
  await expect(page).toHaveURL(
    /\/admin\/teachers\/[^?]+\?.*workshopDefinitionId=fixture-definition-1.*saved=created/
  )
  await expect(page.getByRole('heading', { name: 'Teacher Only', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /transfer/i })).toHaveCount(0)
  const teacher = await prisma.user.findUniqueOrThrow({
    where: { email: 'teacher-only@fixture.local' },
    include: { classesTaught: true },
  })
  expect(teacher.classesTaught).toHaveLength(1)
  await page.getByRole('button', { name: /Monday, January 4, 2027;/ }).click()
  const date = page.getByLabel('Selected date', { exact: true })
  await date.getByLabel('Start time', { exact: true }).fill('10:00')
  await date.getByLabel('End time', { exact: true }).fill('11:00')
  await date.getByRole('button', { name: 'Add availability', exact: true }).click()
  await expect(date.getByRole('status')).toHaveText('Availability saved.')
  await page.getByRole('navigation', { name: 'Teacher sections' }).getByRole('link', { name: 'Workshops', exact: true }).click()
  await page.getByLabel('Workshop', { exact: true }).selectOption('fixture-definition-1')
  await page.getByRole('button', { name: 'Add workshop to teacher' }).click()
  await expect(
    page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: 'Workshop 1', exact: true }) })
  ).toBeVisible()
  await page.goto(
    '/admin/workshops/new?workshopDefinitionId=fixture-definition-1&teacherId=' + teacher.id
  )
  await expect(page.getByLabel('Choose or add a teacher')).toHaveValue(teacher.id)
  await expect(
    page.getByLabel(/Class label|Use a saved class|Class with this teacher/i)
  ).toHaveCount(0)
  await page.getByLabel('Vancouver date').fill('2027-01-04')
  await page.getByLabel('Start time', { exact: true }).fill('10:00')
  await page.getByLabel('End time', { exact: true }).fill('11:00')
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 })
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations
    ).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `work/teacher-booking-${width}.png`, fullPage: true })
  }
  await page.getByRole('button', { name: 'Schedule teacher session', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/workshops\/.*saved=1/)
  expect(await prisma.classSection.count({ where: { teacherId: teacher.id } })).toBe(1)
  expect(await prisma.workshopSession.count()).toBe(1)
  await page.goto('/admin/teachers/' + teacher.id)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations
  ).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'work/teacher-profile-mobile.png', fullPage: true })
})
