import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { prisma } from '../../src/lib/db'
import { resetFixtures, createSessionFixture } from '../fixtures'
import { vancouverToUtc } from '../../src/lib/time'
import { login } from './helpers'

test.afterAll(() => prisma.$disconnect())

test('published workshop opens its calendar, keeps drafts visible, and edits details in place', async ({
  page,
}) => {
  const f = await resetFixtures()
  const first = await createSessionFixture({
    data: {
      classSectionId: f.cls.id,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      scheduledStart: vancouverToUtc('2027-01-06', 600),
      scheduledEnd: vancouverToUtc('2027-01-06', 660),
      minPAs: 1,
      maxPAs: 2,
      hostTeacherName: 'Recorded Teacher',
      hostSchoolName: 'Recorded School',
      location: 'Room 12',
    },
  })
  const enrollment = await prisma.classWorkshop.findUniqueOrThrow({
    where: { id: first.classWorkshopId },
  })
  const run = await prisma.workshopDefinition.update({
    where: { id: enrollment.workshopDefinitionId },
    data: {
      title: 'Calendar workshop',
      deliveryStartsOn: new Date('2027-01-01'),
      deliveryEndsOn: new Date('2027-02-28'),
    },
  })
  const second = await prisma.classWorkshop.create({
    data: { classSectionId: f.sibling.id, workshopDefinitionId: run.id },
  })
  await prisma.workshopSession.create({
    data: {
      classWorkshopId: second.id,
      status: 'DRAFT',
      scheduledStart: vancouverToUtc('2027-02-02', 600),
      scheduledEnd: vancouverToUtc('2027-02-02', 660),
    },
  })
  await prisma.workshopSession.create({
    data: {
      classWorkshopId: first.classWorkshopId,
      status: 'CANCELLED',
      publishedAt: new Date(),
      scheduledStart: new Date('2027-02-01T06:00:00Z'),
      scheduledEnd: new Date('2027-02-01T06:30:00Z'),
    },
  })
  await createSessionFixture({
    data: {
      classSectionId: f.cls.id,
      status: 'PUBLISHED',
      scheduledStart: vancouverToUtc('2027-01-06', 600),
      scheduledEnd: vancouverToUtc('2027-01-06', 660),
      hostSchoolName: 'Unrelated workshop school',
    },
  })
  await login(page, f.admin.email, 'admin')
  const path = `/admin/workshop-definitions/${run.id}`
  await page.goto(path)
  await expect(page.getByText('Workshop overview', { exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Workshop workflow' })).toHaveCount(0)
  await expect(page.getByLabel('Workshop summary')).toContainText('Drafts')
  await expect(page.getByRole('region', { name: 'Sessions needing attention' })).toContainText(
    'Needs PAs'
  )
  const calendar = page.getByRole('region', { name: 'Workshop session calendar' })
  await expect(calendar.getByRole('heading', { name: 'January 2027', exact: true })).toBeVisible()
  await expect(page.getByText('Unrelated workshop school')).toHaveCount(0)
  const selected = calendar.getByRole('complementary', { name: 'Selected session date' })
  await expect(selected).toContainText('Recorded School')
  await expect(selected).toContainText('Recorded Teacher')
  await expect(selected).toContainText('Room 12')
  await selected.getByRole('link', { name: 'View & edit session' }).click()
  await expect(page).toHaveURL(new RegExp(`/admin/workshops/${first.id}`))
  await page
    .getByRole('link', { name: '← Back to Calendar workshop schedule', exact: true })
    .click()
  await expect(calendar).toBeVisible()
  await calendar.getByLabel('Session status', { exact: true }).selectOption('CANCELLED')
  await calendar.getByRole('button', { name: /Sunday, January 31, 2027; 1 sessions/ }).click()
  await expect(selected.getByText('cancelled', { exact: true })).toBeVisible()
  await calendar.getByRole('link', { name: 'Next month' }).click()
  await expect(calendar.getByRole('heading', { name: 'February 2027', exact: true })).toBeVisible()
  await expect(selected.getByText('draft', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Continue scheduling' }).click()
  await expect(page.getByRole('navigation', { name: 'Workshop workflow' })).toBeVisible()
  await page.getByRole('link', { name: 'View workshop calendar', exact: true }).click()
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations
    ).toEqual([])
    await page.getByRole('heading', { name: 'Session calendar', exact: true }).click()
    await page.screenshot({ path: `work/workshop-overview-${width}.png`, fullPage: true })
  }
  await page.getByText('Edit workshop details', { exact: true }).click()
  await page.getByLabel('Workshop title', { exact: true }).fill('Updated calendar workshop')
  await page.getByRole('button', { name: 'Save workshop details', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Updated calendar workshop', exact: true })
  ).toBeVisible()
  await expect(calendar).toBeVisible()
  expect(await prisma.workshopSession.findUnique({ where: { id: first.id } })).toEqual(first)
})
