import { test, expect } from '@playwright/test'
import { prisma } from '../../src/lib/db'
import { resetFixtures } from '../fixtures'
import { vancouverToUtc } from '../../src/lib/time'
import { login } from './helpers'
test('reviews replacement, reschedule, cancellation and completion while role history stays accurate', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000)
  const f = await resetFixtures()
  const replacement = await prisma.user.create({
    data: { name: 'Replacement PA', email: 'replacement@fixture.local', role: 'PA' },
  })
  await prisma.schedulingSettings.update({ where: { id: 1 }, data: { minimumGapMinutes: 60 } })
  for (const paId of [f.pa.id, replacement.id]) {
    await prisma.monthlyPAQuota.createMany({
      data: ['2027-01', '2027-02'].map((month) => ({ paId, month, quota: 4 })),
    })
    await prisma.availability.createMany({
      data: [600, 630].map((startMin) => ({ userId: paId, dayOfWeek: 0, startMin })),
    })
  }
  const w = await prisma.workshop.create({
    data: {
      classSectionId: f.cls.id,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      locked: true,
      maxPAs: 1,
      scheduledStart: vancouverToUtc('2027-01-04', 600),
      scheduledEnd: vancouverToUtc('2027-01-04', 660),
      assignments: { create: { paId: f.pa.id, status: 'PUBLISHED' } },
    },
  })
  const past = await prisma.workshop.create({
    data: {
      classSectionId: f.sibling.id,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      locked: true,
      scheduledStart: vancouverToUtc('2026-09-07', 600),
      scheduledEnd: vancouverToUtc('2026-09-07', 660),
      assignments: { create: { paId: f.pa.id, status: 'PUBLISHED' } },
    },
  })
  const paContext = await browser.newContext(),
    paPage = await paContext.newPage()
  await login(paPage, f.pa.email, 'pa')
  await paPage.getByRole('link', { name: 'Edit availability' }).click()
  for (const label of ['Monday 10:00–10:30 AM', 'Monday 10:30–11:00 AM']) {
    await paPage.getByRole('checkbox', { name: label, exact: true }).uncheck()
  }
  await paPage.getByRole('button', { name: 'Save availability' }).click()
  await expect(paPage.getByText('Availability saved.', { exact: true })).toBeVisible()
  await paPage.goto('/pa')
  await expect(paPage.getByText(/This commitment needs admin review/)).toBeVisible()
  await login(page, f.admin.email, 'admin')
  await page.goto('/admin/workshops/' + w.id)
  await page.getByText('Replace a PA', { exact: true }).click()
  await page.getByLabel('Replacement PA', { exact: true }).selectOption(replacement.id)
  await page.locator('#REPLACE-reason').fill('Original PA unavailable')
  await page.getByRole('button', { name: 'Review replacement' }).click()
  await expect(page.getByRole('heading', { name: 'Review workshop change' })).toBeVisible()
  await paPage.reload()
  await expect(paPage.getByText('Fixture Biology', { exact: true })).toBeVisible()
  expect((await prisma.assignment.findFirstOrThrow({ where: { workshopId: w.id } })).paId).toBe(
    f.pa.id
  )
  await page.getByRole('button', { name: 'Apply workshop change' }).click()
  await expect(page).toHaveURL(/changed=1/)
  await paPage.reload()
  await expect(paPage.getByText(/Fixture Biology: Your assignment was replaced/)).toBeVisible()
  await expect(paPage.getByText('Fixture Biology', { exact: true })).toHaveCount(0)
  await page.getByText('Reschedule workshop', { exact: true }).click()
  await page.getByLabel('New date', { exact: true }).fill('2027-02-01')
  await page.locator('#RESCHEDULE-reason').fill('School requested a new date')
  await page.getByRole('button', { name: 'Review reschedule' }).click()
  expect((await prisma.workshop.findUniqueOrThrow({ where: { id: w.id } })).scheduledStart).toEqual(
    w.scheduledStart
  )
  await page.getByRole('button', { name: 'Apply workshop change' }).click()
  await expect(page).toHaveURL(/changed=1/)
  await page.setViewportSize({ width: 390, height: 844 })
  const cancel = page.getByText('Cancel workshop', { exact: true })
  await cancel.focus()
  await cancel.press('Enter')
  await page.locator('#CANCEL-reason').fill('School closure')
  await page.getByRole('button', { name: 'Review cancellation' }).click()
  await expect(page.getByRole('button', { name: 'Apply workshop change' })).toBeInViewport()
  await page.screenshot({ path: 'work/change-review-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Apply workshop change' }).click()
  await expect(page).toHaveURL(/changed=1/)
  await page.goto('/admin/workshops/' + past.id)
  await page.getByText('Record completion', { exact: true }).click()
  await page.locator('#COMPLETE-reason').fill('Workshop delivered')
  await page.getByRole('button', { name: 'Review completion' }).click()
  await page.getByRole('button', { name: 'Apply workshop change' }).click()
  await expect(page).toHaveURL(/changed=1/)
  await paPage.reload()
  await expect(paPage.getByText('Status: completed', { exact: true })).toBeVisible()
  const context = await browser.newContext(),
    teacherPage = await context.newPage()
  await login(teacherPage, f.teacher.email, 'teacher')
  await expect(teacherPage.getByText('Status: cancelled', { exact: true })).toBeVisible()
  await expect(teacherPage.getByText('Status: completed', { exact: true })).toBeVisible()
  await expect(
    teacherPage.getByText('Latest change: School closure', { exact: true })
  ).toBeVisible()
  const other = await browser.newContext(),
    otherPage = await other.newPage()
  await login(otherPage, f.otherTeacher.email, 'teacher')
  await expect(otherPage.getByText('Fixture Biology', { exact: true })).toHaveCount(0)
  await other.close()
  await context.close()
  await paContext.close()
})
