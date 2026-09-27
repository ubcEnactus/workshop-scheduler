import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { prisma } from '../../src/lib/db'
import { vancouverToUtc } from '../../src/lib/time'
import { addCandidateFixture, createSessionFixture, resetFixtures } from '../fixtures'
import { login } from './helpers'

test.afterAll(() => prisma.$disconnect())

test('calendar publication recovers the original request after a lost response and reload', async ({
  page,
}) => {
  const f = await resetFixtures()
  await prisma.availability.createMany({
    data: [600, 615, 630, 645].map((startMin) => ({ userId: f.pa.id, dayOfWeek: 0, startMin })),
  })
  const session = await createSessionFixture({
    data: {
      classSectionId: f.cls.id,
      scheduledStart: vancouverToUtc('2027-01-04', 600),
      scheduledEnd: vancouverToUtc('2027-01-04', 660),
      minPAs: 1,
      maxPAs: 2,
    },
  })
  await prisma.assignment.create({
    data: { workshopSessionId: session.id, paId: f.pa.id, status: 'DRAFT', source: 'MANUAL' },
  })
  await login(page, f.admin.email, 'admin')
  await page.goto('/admin/workshops?month=2027-01')
  await page.getByRole('checkbox', { name: /Select Fixture Biology .* for publication/ }).check()
  await page.getByRole('button', { name: 'Review publication (1)' }).click()
  let intercepted = false
  await page.route('**/admin/workshops?month=2027-01', async (route) => {
    if (route.request().method() !== 'POST' || intercepted) return route.continue()
    intercepted = true
    await route.fetch()
    await route.abort('failed')
  })
  await page.getByRole('button', { name: 'Publish selected teacher sessions' }).click()
  await expect(page.getByRole('button', { name: 'Retry and check publication' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeDisabled()
  await page.unroute('**/admin/workshops?month=2027-01')
  page.on('dialog', (dialog) => dialog.accept())
  await page.reload()
  await page.getByRole('button', { name: 'Retry and check publication' }).click()
  await expect(page.getByText(/^1 teacher session published\./)).toBeVisible()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  expect(
    await prisma.workshopEvent.count({ where: { workshopSessionId: session.id, kind: 'PUBLISH' } })
  ).toBe(1)
  expect(await prisma.publicationReceipt.count()).toBe(1)
})

test('staffing guides publication, keeps settings quiet, and recovers a lost publication response', async ({
  page,
}) => {
  const f = await resetFixtures()
  await prisma.availability.createMany({
    data: [600, 615, 630, 645].map((startMin) => ({ userId: f.pa.id, dayOfWeek: 0, startMin })),
  })
  const enrollment = await addCandidateFixture(f.cls.id, '2027-01-04')
  const session = await prisma.workshopSession.create({
    data: {
      classWorkshopId: enrollment.classWorkshopId,
      scheduledStart: vancouverToUtc('2027-01-04', 600),
      scheduledEnd: vancouverToUtc('2027-01-04', 660),
      minPAs: 1,
      maxPAs: 2,
    },
  })
  await login(page, f.admin.email, 'admin')
  await page.goto(`/admin/workshops/${session.id}`)
  await expect(page.getByText('Edit date and details', { exact: true })).toBeVisible()
  await expect(
    page
      .locator('details')
      .filter({ has: page.getByText('Edit date and details', { exact: true }) })
  ).not.toHaveAttribute('open')
  await expect(page.getByText('Auto-fill settings', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Exclude session from auto-fill' })
  ).not.toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'work/usability-v2/detail-mobile.png', fullPage: true })
  await page.goto('/admin/workshop-definitions/fixture-definition-1?step=staff')
  await expect(page.getByRole('link', { name: '2. Staff', exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  )
  await expect(page.getByRole('heading', { name: 'Build your PA team' })).toBeVisible()
  await page.getByRole('button', { name: 'Auto-fill missing PAs (1)' }).focus()
  await page.keyboard.press('Enter')
  const next = page.getByRole('link', { name: 'Review & publish (1) →', exact: true })
  await expect(next).toBeVisible()
  await expect(next).toHaveClass(/bg-amber-400/)
  await expect(page.getByRole('button', { name: 'Remove Fixture PA' })).not.toHaveClass(
    /bg-amber-400/
  )
  await page.screenshot({ path: 'work/usability-v2/staff-mobile.png', fullPage: true })
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: 'work/usability-v2/staff-desktop.png', fullPage: true })
  await next.click()
  await page.getByRole('button', { name: 'Select all ready' }).click()
  await page.screenshot({ path: 'work/usability-v2/publish-desktop.png', fullPage: true })
  let intercepted = false
  await page.route('**/admin/workshop-definitions/fixture-definition-1**', async (route) => {
    if (route.request().method() !== 'POST' || intercepted) return route.continue()
    intercepted = true
    await route.fetch()
    await route.abort('failed')
  })
  await page.getByRole('button', { name: 'Publish 1 session', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Retry and check save' })).toBeVisible()
  expect(
    await prisma.workshopEvent.count({ where: { workshopSessionId: session.id, kind: 'PUBLISH' } })
  ).toBe(1)
  await page.unroute('**/admin/workshop-definitions/fixture-definition-1**')
  page.on('dialog', (dialog) => dialog.accept())
  await page.reload()
  await page.getByRole('button', { name: 'Retry and check save' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: '1 teacher session published' })
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry and check save' })).toHaveCount(0)
  expect(
    await prisma.workshopEvent.count({ where: { workshopSessionId: session.id, kind: 'PUBLISH' } })
  ).toBe(1)
  expect(await prisma.publicationReceipt.count()).toBe(1)
})
