import { createSessionFixture } from '../fixtures'
import { test, expect } from '@playwright/test'
import { prisma } from '../../src/lib/db'
import { resetFixtures } from '../fixtures'
import { login } from './helpers'
import { vancouverToUtc } from '../../src/lib/time'

test.afterAll(async () => {
  await prisma.$disconnect()
})

test('detail staffing, locking and publication retain the filtered return view', async ({
  page,
}) => {
  const f = await resetFixtures()
  await prisma.availability.createMany({
    data: [600, 615, 630, 645].map((startMin) => ({
      userId: f.pa.id,
      dayOfWeek: 0,
      startMin,
    })),
  })
  const workshop = await createSessionFixture({
    data: {
      classSectionId: f.cls.id,
      scheduledStart: vancouverToUtc('2027-01-04', 600),
      scheduledEnd: vancouverToUtc('2027-01-04', 660),
      minPAs: 1,
      maxPAs: 1,
    },
  })
  const { workshopDefinitionId } = await prisma.classWorkshop.findUniqueOrThrow({
    where: { id: workshop.classWorkshopId },
    select: { workshopDefinitionId: true },
  })
  await login(page, f.admin.email, 'admin')
  const context = new URLSearchParams({
    month: '2027-01',
    schoolId: f.school.id,
    classSectionId: f.cls.id,
    view: 'draft',
  }).toString()
  await page.goto('/admin/workshops/' + workshop.id + '?' + context)
  await page.getByRole('button', { name: 'Assign Fixture PA', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove PA', exact: true })).toBeVisible()
  for (const action of ['Exclude session from auto-fill', 'Allow auto-fill', 'Publish session']) {
    if (
      action !== 'Publish session' &&
      !(await page.getByRole('button', { name: action, exact: true }).isVisible())
    )
      await page.getByText('Auto-fill settings', { exact: true }).click()
    await expect(page).toHaveURL(
      (url) =>
        url.searchParams.get('month') === '2027-01' &&
        url.searchParams.get('schoolId') === f.school.id &&
        url.searchParams.get('classSectionId') === f.cls.id &&
        url.searchParams.get('view') === 'draft'
    )
    await page.getByRole('button', { name: action, exact: true }).click()
    if (action === 'Exclude session from auto-fill')
      await expect(
        page.getByRole('button', { name: 'Allow auto-fill', exact: true, includeHidden: true })
      ).toHaveCount(1)
    if (action === 'Allow auto-fill')
      await expect(
        page.getByRole('button', {
          name: 'Exclude session from auto-fill',
          exact: true,
          includeHidden: true,
        })
      ).toHaveCount(1)
  }
  await expect(page.getByText('Status: published', { exact: true })).toBeVisible()
  const returnContext = new URLSearchParams(context)
  returnContext.set('workshopDefinitionId', workshopDefinitionId)
  const returnLink = page.getByRole('link', {
    name: '← Back to Fixture workshop schedule',
    exact: true,
  })
  const returnHref = await returnLink.getAttribute('href')
  expect(returnHref).not.toBeNull()
  const returnUrl = new URL(returnHref!, page.url())
  expect(returnUrl.pathname).toBe('/admin/workshops')
  expect(Object.fromEntries(returnUrl.searchParams)).toEqual(Object.fromEntries(returnContext))
  await returnLink.click()
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/admin/workshops' &&
      [...returnContext].every(([key, value]) => url.searchParams.get(key) === value)
  )
  await expect(page.getByLabel('School filter')).toHaveValue(f.school.id)
  await expect(page.getByLabel('Teacher filter')).toHaveValue(f.cls.id)
})

test('rapid filter changes compose while the first navigation is delayed', async ({ page }) => {
  const f = await resetFixtures()
  await login(page, f.admin.email, 'admin')
  await page.goto('/admin/workshops?month=2027-01')
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let held = false
  await page.route('**/admin/workshops?**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (
      !held &&
      request.headers().rsc &&
      url.searchParams.get('schoolId') === f.school.id &&
      url.searchParams.get('month') === '2027-01'
    ) {
      held = true
      await gate
    }
    await route.continue()
  })
  try {
    await page.getByLabel('School filter').selectOption(f.school.id)
    await expect.poll(() => held).toBe(true)
    await page.getByLabel('Month', { exact: true }).fill('2027-02')
    await page.getByLabel('Teacher filter').selectOption(f.cls.id)
    release()
    await expect(page).toHaveURL(
      (url) =>
        url.searchParams.get('month') === '2027-02' &&
        url.searchParams.get('schoolId') === f.school.id &&
        url.searchParams.get('classSectionId') === f.cls.id
    )
    await expect(page.getByLabel('School filter')).toHaveValue(f.school.id)
    await expect(page.getByLabel('Teacher filter')).toHaveValue(f.cls.id)
    await page.getByRole('link', { name: 'Next month' }).click()
    await expect(page.getByLabel('Month', { exact: true })).toHaveValue('2027-03')
    await expect(page).toHaveURL(
      (url) =>
        url.searchParams.get('month') === '2027-03' &&
        url.searchParams.get('schoolId') === f.school.id &&
        url.searchParams.get('classSectionId') === f.cls.id
    )
    await page.goBack()
    await expect(page.getByLabel('Month', { exact: true })).toHaveValue('2027-02')
    await page.getByRole('link', { name: 'Reset filters', exact: true }).first().click()
    await expect(page).toHaveURL(/\/admin\/workshops\?month=2027-02$/)
  } finally {
    release()
    await page.unrouteAll({ behavior: 'wait' })
  }
})
