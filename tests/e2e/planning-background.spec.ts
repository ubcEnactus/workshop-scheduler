import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { prisma } from '../../src/lib/db'
import { addCandidateFixture, resetFixtures } from '../fixtures'
import { login } from './helpers'

test.afterAll(() => prisma.$disconnect())

async function planningFixture() {
  const f = await resetFixtures()
  await prisma.workshopDefinition.update({
    where: { id: 'fixture-definition-1' },
    data: {
      deliveryStartsOn: new Date('2027-01-04T00:00:00Z'),
      deliveryEndsOn: new Date('2027-01-10T00:00:00Z'),
      defaultMinPAs: 1,
      defaultMaxPAs: 1,
    },
  })
  await prisma.classMeeting.deleteMany()
  await addCandidateFixture(f.cls.id, '2027-01-04')
  await addCandidateFixture(f.cls.id, '2027-01-05')
  await prisma.availability.createMany({
    data: [600, 615, 630, 645].map((startMin) => ({ userId: f.pa.id, dayOfWeek: 0, startMin })),
  })
  return f
}

test('background staffing failure can retry, preserves dates, and never blocks a valid save', async ({
  page,
}) => {
  const f = await planningFixture()
  await login(page, f.admin.email, 'admin')
  await page.goto('/admin/workshop-definitions/fixture-definition-1?step=plan&week=2027-01-04')
  const candidate = page.getByLabel('Fixture School · Fixture Biology date and time')
  const check = page.getByRole('region', { name: 'Staffing check', exact: true })
  await page.route('**/admin/workshop-definitions/fixture-definition-1**', async (route) => {
    if (route.request().method() === 'POST') await route.abort('failed')
    else await route.continue()
  })
  await candidate.selectOption({ index: 1 })
  const first = await candidate.inputValue()
  await expect(check.getByRole('alert')).toContainText('could not finish')
  await expect(candidate).toHaveValue(first)
  await expect(
    page.getByRole('button', { name: 'Save dates & continue', exact: true })
  ).toBeEnabled()
  await page.unroute('**/admin/workshop-definitions/fixture-definition-1**')
  await check.getByRole('button', { name: 'Retry staffing check' }).click()
  await expect(check.getByRole('status')).toContainText('Staffing looks feasible')
  expect(await prisma.workshopSession.count()).toBe(0)
  expect(await prisma.assignment.count()).toBe(0)
  await page.route('**/admin/workshop-definitions/fixture-definition-1**', async (route) => {
    if (route.request().method() === 'POST') await route.abort('failed')
    else await route.continue()
  })
  await candidate.selectOption({ index: 2 })
  await expect(check.getByRole('alert')).toContainText('could not finish')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.screenshot({ path: 'work/workspace-plan-check-failure-mobile.png', fullPage: true })
  await page.unroute('**/admin/workshop-definitions/fixture-definition-1**')
  await page.getByRole('button', { name: 'Save dates & continue', exact: true }).click()
  await expect(page).toHaveURL(/step=staff&created=1&batch=/)
  expect(await prisma.workshopSession.count()).toBe(1)
  expect(await prisma.assignment.count()).toBe(0)
})

test('late results cannot certify changed dates and a shortage still permits the secondary Save dates', async ({
  page,
}) => {
  const f = await planningFixture()
  await login(page, f.admin.email, 'admin')
  await page.goto(
    `/admin/workshop-definitions/fixture-definition-1?step=plan&week=2027-01-04&classSectionId=${f.cls.id}`
  )
  const candidate = page.getByLabel('Fixture School · Fixture Biology date and time')
  const check = page.getByRole('region', { name: 'Staffing check', exact: true })
  let release: (() => void) | undefined
  let held = false
  await page.route('**/admin/workshop-definitions/fixture-definition-1**', async (route) => {
    if (route.request().method() !== 'POST' || held) return route.continue()
    const response = await route.fetch()
    held = true
    await new Promise<void>((resolve) => {
      release = resolve
    })
    await route.fulfill({ response })
  })
  await candidate.selectOption({ index: 1 })
  await expect.poll(() => held).toBe(true)
  await candidate.selectOption({ index: 2 })
  await expect(check.getByRole('status')).not.toContainText('Staffing looks feasible')
  const staleResults: string[] = []
  await page.exposeFunction('recordStaffingResult', (value: string) => staleResults.push(value))
  await check.getByRole('status').evaluate((element) => {
    const browserWindow = window as typeof window & {
      recordStaffingResult: (value: string) => Promise<void>
    }
    new MutationObserver(() => {
      void browserWindow.recordStaffingResult(element.textContent ?? '')
    }).observe(element, { subtree: true, childList: true, characterData: true })
  })
  release?.()
  await expect(check.getByRole('status')).toContainText('Automatic staffing has a shortfall')
  await expect(check.getByRole('status')).not.toContainText('Staffing looks feasible')
  expect(staleResults.some((value) => value.includes('Staffing looks feasible'))).toBe(false)
  expect(await prisma.assignment.count()).toBe(0)
  await page.getByRole('button', { name: 'Save dates', exact: true }).click()
  await expect(page).toHaveURL(
    (url) =>
      url.pathname.endsWith('/fixture-definition-1') &&
      url.searchParams.get('step') === 'plan' &&
      url.searchParams.get('created') === '1' &&
      url.searchParams.get('classSectionId') === f.cls.id
  )
  expect(await prisma.workshopSession.count()).toBe(1)
  expect(await prisma.assignment.count()).toBe(0)
})
