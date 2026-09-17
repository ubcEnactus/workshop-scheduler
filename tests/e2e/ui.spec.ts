import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { prisma } from '../../src/lib/db'
import { resetFixtures } from '../fixtures'
import { vancouverToUtc } from '../../src/lib/time'
import { login } from './helpers'
import { mkdir, writeFile } from 'node:fs/promises'

async function audit(page: Page, label: string) {
  await expect(page.locator('main')).toHaveCount(1)
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  const geometry = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    noPageOverflow: document.documentElement.scrollWidth <= window.innerWidth,
  }))
  await writeFile(
    'work/ui-review/' + label + '.json',
    JSON.stringify(
      { viewport: page.viewportSize(), geometry, violations: result.violations },
      null,
      2
    )
  )
  expect
    .soft(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      })),
      label + ' accessibility'
    )
    .toEqual([])
  expect.soft(geometry.noPageOverflow, label + ' has no page overflow').toBe(true)
  await page.screenshot({ path: 'work/ui-review/' + label + '.png', fullPage: true })
}
async function setup() {
  const f = await resetFixtures()
  await prisma.user.update({ where: { id: f.admin.id }, data: { name: 'Alex Morgan' } })
  await prisma.user.update({ where: { id: f.pa.id }, data: { name: 'Amelia Chen' } })
  await prisma.user.update({ where: { id: f.teacher.id }, data: { name: 'Jordan Lee' } })
  await prisma.school.update({
    where: { id: f.school.id },
    data: { name: 'Kitsilano Secondary', district: 'Vancouver' },
  })
  await prisma.school.update({
    where: { id: f.otherSchool.id },
    data: { name: 'Burnaby North Secondary', district: 'Burnaby' },
  })
  await prisma.classSection.update({
    where: { id: f.cls.id },
    data: { name: 'Biology 11 · Period 2', monthlyCadence: 2 },
  })
  await prisma.classSection.update({
    where: { id: f.sibling.id },
    data: { name: 'Chemistry 12 · Period 4' },
  })
  const other = await prisma.user.create({
    data: { role: 'PA', name: 'Mateo Singh', email: 'mateo@fixture.local' },
  })
  await prisma.schedulingSettings.update({ where: { id: 1 }, data: { minimumGapDays: 1 } })
  for (const paId of [f.pa.id, other.id]) {
    await prisma.monthlyPAQuota.createMany({
      data: ['2027-01', '2027-02'].map((month) => ({ paId, month, quota: 4 })),
    })
    await prisma.availability.createMany({
      data: [0, 1].flatMap((dayOfWeek) =>
        Array.from({ length: 12 }, (_, i) => ({ userId: paId, dayOfWeek, startMin: 540 + i * 30 }))
      ),
    })
  }
  const draft = await prisma.workshop.create({
    data: {
      classSectionId: f.cls.id,
      minPAs: 2,
      maxPAs: 3,
      scheduledStart: vancouverToUtc('2027-01-04', 600),
      scheduledEnd: vancouverToUtc('2027-01-04', 660),
      assignments: { create: { paId: f.pa.id, source: 'AUTOMATIC', status: 'DRAFT' } },
    },
  })
  const published = await prisma.workshop.create({
    data: {
      classSectionId: f.sibling.id,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      locked: true,
      scheduledStart: vancouverToUtc('2027-01-11', 600),
      scheduledEnd: vancouverToUtc('2027-01-11', 660),
      assignments: { create: { paId: f.pa.id, status: 'PUBLISHED' } },
    },
  })
  await prisma.workshop.create({
    data: {
      classSectionId: f.cls.id,
      status: 'COMPLETED',
      publishedAt: new Date(),
      locked: true,
      scheduledStart: vancouverToUtc('2026-09-07', 600),
      scheduledEnd: vancouverToUtc('2026-09-07', 660),
      assignments: { create: { paId: f.pa.id, status: 'PUBLISHED' } },
    },
  })
  await mkdir('work/ui-review', { recursive: true })
  return { ...f, other, draft, published }
}
test('public screens are responsive and accessible', async ({ page }) => {
  test.setTimeout(180_000)
  await resetFixtures()
  await mkdir('work/ui-review', { recursive: true })
  for (const [width, size] of [
    [1440, 'desktop'],
    [390, 'mobile'],
  ] as const) {
    await page.setViewportSize({ width, height: 960 })
    for (const [url, name] of [
      ['/', 'landing'],
      ['/login', 'login'],
      ['/login/check-email', 'email'],
      ['/403', 'forbidden'],
    ]) {
      await page.goto(url)
      await audit(page, name + '-' + size)
    }
  }
})
test('admin screens and reviews are responsive and accessible', async ({ page }) => {
  test.setTimeout(300_000)
  const f = await setup()
  await login(page, f.admin.email, 'admin')
  await page.goto('/admin/workshops/match?month=2027-01')
  await page.getByRole('button', { name: 'Preview PA assignments' }).click()
  await expect(page.getByRole('heading', { name: 'Review PA assignments' })).toBeVisible()
  const matchPath = new URL(page.url()).pathname
  await page.goto('/admin/workshops/' + f.published.id)
  await page.getByText('Cancel workshop', { exact: true }).click()
  await page
    .locator('#CANCEL-reason')
    .fill('School requested a different date; confirm a replacement before cancelling.')
  await page.getByRole('button', { name: 'Review cancellation' }).click()
  await expect(page.getByRole('heading', { name: 'Review workshop change' })).toBeVisible()
  const changePath = new URL(page.url()).pathname
  const routes = [
    ['/admin', 'admin-dashboard'],
    ['/admin/schools', 'schools'],
    ['/admin/schools/' + f.school.id + '/edit', 'school-edit'],
    ['/admin/teachers', 'teachers'],
    ['/admin/teachers/' + f.teacher.id + '/edit', 'teacher-edit'],
    ['/admin/pas', 'pas'],
    ['/admin/pas/' + f.pa.id + '/edit', 'pa-edit'],
    ['/admin/classes', 'classes'],
    ['/admin/classes/' + f.cls.id + '/edit', 'class-edit'],
    ['/admin/workshops?month=2027-01', 'workshops'],
    ['/admin/workshops/' + f.draft.id, 'workshop-detail'],
    [
      '/admin/workshops/plan?month=2027-02&preview=1&classId=' +
        f.cls.id +
        '&classId=' +
        f.sibling.id,
      'monthly-plan',
    ],
    ['/admin/staffing?month=2027-01', 'staffing'],
    ['/admin/workshops/match?month=2027-01', 'matching'],
    [matchPath, 'matching-review'],
    [changePath, 'change-review'],
  ]
  for (const [width, size] of [
    [1440, 'desktop'],
    [390, 'mobile'],
  ] as const) {
    await page.setViewportSize({ width, height: 1000 })
    for (const [url, name] of routes) {
      await page.goto(url)
      await audit(page, name + '-' + size)
    }
  }
})
test('role dashboards and availability are responsive and accessible', async ({ browser }) => {
  test.setTimeout(180_000)
  const f = await setup()
  for (const [email, role] of [
    [f.pa.email, 'pa'],
    [f.teacher.email, 'teacher'],
  ] as const) {
    const context = await browser.newContext(),
      page = await context.newPage()
    await login(page, email, role)
    for (const [width, size] of [
      [1440, 'desktop'],
      [390, 'mobile'],
    ] as const) {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto('/' + role)
      await audit(page, role + '-dashboard-' + size)
      if (role === 'pa') {
        await page.goto('/pa/availability')
        await audit(page, 'availability-' + size)
      }
    }
    await context.close()
  }
})
test('mobile navigation supports keyboard, active routes and sign out', async ({ page }) => {
  const f = await setup()
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, f.admin.email, 'admin')
  const menu = page.getByRole('button', { name: 'Open navigation' })
  await menu.focus()
  await menu.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Navigation menu' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Close navigation' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: 'Sign out' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Close navigation' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(menu).toBeFocused()
  await menu.click()
  await dialog.getByRole('link', { name: 'Plan a month', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/workshops\/plan\?month=/)
  await expect(dialog).not.toBeVisible()
  await menu.click()
  await expect(dialog.getByRole('link', { name: 'Plan a month', exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  )
  await expect(dialog.getByRole('link', { name: 'Workshops', exact: true })).not.toHaveAttribute(
    'aria-current',
    'page'
  )
  await audit(page, 'navigation-mobile')
  await dialog.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/login$/)
})

test('empty directories offer direct booking without class setup', async ({ page }) => {
  const f = await resetFixtures()
  await prisma.user.updateMany({ where: { role: 'TEACHER' }, data: { deletedAt: new Date() } })
  await prisma.school.updateMany({ data: { deletedAt: new Date() } })
  await login(page, f.admin.email, 'admin')
  await mkdir('work/ui-review', { recursive: true })
  for (const [width, size] of [
    [1440, 'desktop'],
    [390, 'mobile'],
  ] as const) {
    await page.setViewportSize({ width, height: 960 })
    await page.goto('/admin/teachers')
    await expect(page.getByRole('button', { name: 'Add teacher', exact: true })).toBeDisabled()
    await expect(page.getByRole('link', { name: 'Go to schools', exact: true })).toBeVisible()
    await audit(page, 'teachers-empty-' + size)
    await page.goto('/admin/classes')
    await expect(page.getByRole('link', { name: 'Book workshop', exact: true })).toBeVisible()
    await expect(
      page.getByText(
        'No classes yet. Book a workshop to add its school, teacher and class together.'
      )
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Go to teachers', exact: true })).toHaveCount(0)
    await audit(page, 'classes-empty-' + size)
  }
})
