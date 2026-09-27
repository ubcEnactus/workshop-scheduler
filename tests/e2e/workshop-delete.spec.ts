import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { prisma } from '../../src/lib/db'
import { addCandidateFixture, resetFixtures } from '../fixtures'
import { vancouverToUtc } from '../../src/lib/time'
import { login } from './helpers'

test.afterAll(() => prisma.$disconnect())

test('reviews deletion, cancels safely, then removes only the confirmed draft workshop', async ({
  page,
}) => {
  const fixture = await resetFixtures()
  const candidate = await addCandidateFixture(fixture.cls.id, '2027-01-04')
  await prisma.workshopSession.create({
    data: {
      classWorkshopId: candidate.classWorkshopId,
      scheduledStart: vancouverToUtc('2027-01-04', 600),
      scheduledEnd: vancouverToUtc('2027-01-04', 660),
      assignments: { create: { paId: fixture.pa.id, status: 'DRAFT' } },
    },
  })
  const sharedAvailability = await prisma.availabilitySlot.create({
    data: {
      classSectionId: fixture.cls.id,
      start: vancouverToUtc('2027-01-05', 600),
      end: vancouverToUtc('2027-01-05', 660),
    },
  })
  await login(page, fixture.admin.email, 'admin')
  await page.goto('/admin/workshop-definitions/fixture-definition-1')
  await page.getByText('Workshop options', { exact: true }).click()
  await page.getByRole('link', { name: 'Delete workshop', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Delete workshop?', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Workshop 1', exact: true })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Records to delete' })).toContainText(
    '1 draft teacher session'
  )
  await expect(page.getByRole('list', { name: 'Records to delete' })).toContainText(
    '1 draft PA assignment'
  )
  await expect(page.getByText('This cannot be undone.', { exact: false })).toBeVisible()
  await page.getByRole('link', { name: 'Cancel', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/workshop-definitions\/fixture-definition-1$/)
  expect(await prisma.workshopSession.count()).toBe(1)

  await page.getByText('Workshop options', { exact: true }).click()
  await page.getByRole('link', { name: 'Delete workshop', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations
  ).toEqual([])
  await page.getByRole('button', { name: 'Yes, delete workshop', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Workshop deleted.')
  expect(
    await prisma.workshopDefinition.findUnique({ where: { id: 'fixture-definition-1' } })
  ).toBeNull()
  expect(await prisma.workshopSession.count()).toBe(0)
  expect(await prisma.assignment.count()).toBe(0)
  expect(await prisma.classSection.findUnique({ where: { id: fixture.cls.id } })).not.toBeNull()
  expect(
    await prisma.availabilitySlot.findUnique({ where: { id: sharedAvailability.id } })
  ).not.toBeNull()
  expect(
    await prisma.workshopDefinition.findUnique({ where: { id: 'fixture-definition-2' } })
  ).not.toBeNull()
})

test('requires a fresh confirmation after the workshop changes and protects published history', async ({
  page,
}) => {
  const fixture = await resetFixtures()
  await login(page, fixture.admin.email, 'admin')
  await page.goto('/admin/workshop-definitions/fixture-definition-1/delete')
  const candidate = await addCandidateFixture(fixture.cls.id, '2027-01-04')
  await page.getByRole('button', { name: 'Yes, delete workshop', exact: true }).click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText(/changed|review/i)
  expect(
    await prisma.workshopDefinition.findUnique({ where: { id: 'fixture-definition-1' } })
  ).not.toBeNull()
  await expect(page.getByRole('list', { name: 'Records to delete' })).toContainText(
    '1 included teacher'
  )

  await prisma.workshopSession.create({
    data: {
      classWorkshopId: candidate.classWorkshopId,
      scheduledStart: vancouverToUtc('2027-01-04', 600),
      scheduledEnd: vancouverToUtc('2027-01-04', 660),
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  })
  await page.goto('/admin/workshop-definitions/fixture-definition-1/delete')
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Yes, delete workshop' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Review teacher sessions' })).toHaveAttribute(
    'href',
    '/admin/workshops?workshopDefinitionId=fixture-definition-1'
  )
  expect(await prisma.workshopSession.count({ where: { status: 'PUBLISHED' } })).toBe(1)
})
