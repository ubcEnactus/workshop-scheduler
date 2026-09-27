import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { prisma } from '../../src/lib/db'
import { addCandidateFixture, resetFixtures } from '../fixtures'
import { login } from './helpers'
test.afterAll(() => prisma.$disconnect())
test('named-run planning exposes only recorded candidate availability', async ({ page }) => {
  const f = await resetFixtures()
  await prisma.workshopDefinition.update({
    where: { id: 'fixture-definition-1' },
    data: {
      deliveryStartsOn: new Date('2027-01-01T00:00:00.000Z'),
      deliveryEndsOn: new Date('2027-01-31T00:00:00.000Z'),
    },
  })
  await prisma.classWorkshop.create({
    data: { classSectionId: f.cls.id, workshopDefinitionId: 'fixture-definition-1' },
  })
  await prisma.classMeeting.deleteMany({ where: { classSectionId: f.cls.id } })
  await login(page, f.admin.email, 'admin')
  const planning = '/admin/workshops/plan?workshopDefinitionId=fixture-definition-1&week=2027-01-04'
  await page.goto(planning)
  await expect(page.getByText(/No suitable 60-minute times in this week/)).toBeVisible()

  await addCandidateFixture(f.cls.id, '2027-01-04')
  await page.reload()
  const candidate = page.getByLabel('Fixture School · Fixture Biology date and time')
  await expect(candidate).toHaveCount(1)
  await candidate.selectOption({ index: 1 })
  await expect(candidate.locator('option').nth(1)).not.toContainText('individual slot estimate')
  await expect(page.getByText('Individual slot staffing estimate', { exact: true })).toBeVisible()
  await expect(page.getByText('Selected · not saved', { exact: true })).toBeVisible()
  expect(await prisma.workshopSession.count()).toBe(0)
})

test('keeps a cross-month draft through week changes and an availability detour, then opens the saved batch', async ({
  page,
}) => {
  const f = await resetFixtures()
  await prisma.workshopDefinition.update({
    where: { id: 'fixture-definition-1' },
    data: {
      title: 'Custom workshop',
      deliveryStartsOn: new Date('2027-01-25T00:00:00Z'),
      deliveryEndsOn: new Date('2027-02-12T00:00:00Z'),
      defaultMinPAs: 1,
      defaultMaxPAs: 1,
    },
  })
  await prisma.classMeeting.deleteMany()
  await addCandidateFixture(f.cls.id, '2027-01-25')
  await addCandidateFixture(f.sibling.id, '2027-02-01')
  await prisma.availability.createMany({
    data: [600, 615, 630, 645].map((startMin) => ({ userId: f.pa.id, dayOfWeek: 0, startMin })),
  })
  await login(page, f.admin.email, 'admin')
  await page.goto(
    `/admin/workshops/plan?workshopDefinitionId=fixture-definition-1&classSectionId=${f.cls.id}`
  )
  const biology = page.getByLabel('Fixture School · Fixture Biology date and time')
  await biology.selectOption({ index: 1 })
  await page.getByText('Session details (optional)', { exact: true }).click()
  await page.getByLabel('Location (optional)').fill('Demo classroom')
  await page.getByText(/Date options:.*Change week/).click()
  await page.getByLabel('Show seven days starting').fill('2027-02-01')
  await page.getByRole('button', { name: 'Show dates', exact: true }).click()
  await expect(page).toHaveURL(/week=2027-02-01/)
  await expect(biology).not.toHaveValue('')
  await expect(page.getByRole('region', { name: 'Selected teacher dates' })).toContainText(
    'outside this week’s view'
  )
  await page
    .getByLabel('Fixture School · Fixture Chemistry date and time')
    .selectOption({ index: 1 })
  await page
    .locator(`#planning-class-${f.cls.id}`)
    .getByRole('link', { name: 'Edit teacher availability' })
    .click()
  await expect(page).toHaveURL(new RegExp(`/admin/classes/${f.cls.id}\\?`))
  await page.getByRole('link', { name: /Back to.*(planning|dates)/i }).click()
  await expect(page).toHaveURL(/\/admin\/workshop-definitions\/fixture-definition-1\?step=plan/)
  await expect(page.getByRole('region', { name: 'Selected teacher dates' })).toContainText(
    '2 teacher dates selected'
  )
  await page.getByText('Session details (optional)', { exact: true }).click()
  await expect(page.getByLabel('Location (optional)')).toHaveValue('Demo classroom')
  await expect(page.getByText(/Staffing looks feasible/)).toBeVisible()
  expect(await prisma.assignment.count()).toBe(0)
  await page.getByRole('button', { name: 'Save dates & continue', exact: true }).click()
  await expect(page).toHaveURL(
    /workshop-definitions\/fixture-definition-1\?step=staff&created=2&batch=/
  )
  await expect(
    page.getByRole('status').filter({ hasText: '2 teacher sessions saved to the private draft' })
  ).toBeVisible()
  const workspace = page.getByRole('region', { name: 'Draft staffing' })
  await expect(workspace.locator('article')).toHaveCount(2)
  await expect(workspace).toContainText('Jan 25')
  await expect(workspace).toContainText('Feb 1')
  await expect(page.getByLabel('Month', { exact: true })).toHaveCount(0)
  expect(new URL(page.url()).searchParams.has('classSectionId')).toBe(false)
  expect(await prisma.workshopSession.count()).toBe(2)
  expect(await prisma.assignment.count()).toBe(0)
  await page.screenshot({ path: 'work/workspace-staff-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations
  ).toEqual([])
  await page.screenshot({ path: 'work/workspace-staff-mobile.png', fullPage: true })
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.getByRole('button', { name: 'Auto-fill missing PAs (2)', exact: true }).click()
  await expect.poll(() => prisma.assignment.count()).toBe(2)
  await expect(workspace.getByText('Ready to publish', { exact: true })).toHaveCount(2)
  await page.getByRole('link', { name: '3. Publish', exact: true }).click()
  await page.getByRole('button', { name: 'Select all ready', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Publish 2 sessions', exact: true }).click()
  await expect(page.getByText(/^2 teacher sessions published\./)).toBeVisible()
  expect(await prisma.workshopSession.count({ where: { status: 'PUBLISHED' } })).toBe(2)
  expect(
    await prisma.workshopEvent.count({ where: { kind: 'PUBLISH', communicatedAt: null } })
  ).toBe(2)
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Calendar', exact: true })
    .click()
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/admin/workshops' &&
      !url.searchParams.has('workshopDefinitionId') &&
      !url.searchParams.has('batch')
  )
  await expect(page.getByLabel('Month', { exact: true })).toBeVisible()
})
