import { test, expect } from '@playwright/test'
import { login, requestLink } from './helpers'
import { prisma } from '../../src/lib/db'
import { resetFixtures } from '../fixtures'
import { vancouverToUtc } from '../../src/lib/time'

let fixtures: Awaited<ReturnType<typeof resetFixtures>>
test.beforeEach(async () => {
  fixtures = await resetFixtures()
})
test.afterAll(async () => {
  await prisma.$disconnect()
})

test('invited users in all three roles sign in through real one-time magic links', async ({
  browser,
}) => {
  for (const [user, role] of [
    [fixtures.admin, 'admin'],
    [fixtures.pa, 'pa'],
    [fixtures.teacher, 'teacher'],
  ] as const) {
    const context = await browser.newContext()
    const page = await context.newPage()
    const link = await login(page, user.email, role)
    if (role !== 'admin') {
      for (const route of [
        '/admin',
        '/admin/schools',
        '/admin/teachers',
        '/admin/pas',
        '/admin/classes',
        '/admin/workshops',
        `/admin/classes/${fixtures.cls.id}/edit`,
      ]) {
        await page.goto(route)
        await expect(page).toHaveURL(/\/403$/)
      }
    } else {
      await page.goto('/pa/availability')
      await expect(page).toHaveURL(/\/403$/)
    }
    await context.close()
    const replay = await browser.newContext()
    const replayPage = await replay.newPage()
    await replayPage.goto(link)
    await expect(replayPage).not.toHaveURL(new RegExp(`/${role}$`))
    await replayPage.goto(`/${role}`)
    await expect(replayPage).toHaveURL(/\/login$/)
    await replay.close()
  }
})

test('unknown, deleted and revoked invitees cannot establish a session', async ({ page }) => {
  for (const email of ['unknown@fixture.local', fixtures.deleted.email]) {
    await page.goto('/login')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByRole('button', { name: 'Send magic link' }).click()
    await expect(page).toHaveURL(/\/login\?error=AccessDenied/)
    await expect(
      page.getByText('Sign-in failed. Check the email address and try again.')
    ).toBeVisible()
    expect(await prisma.verificationToken.count({ where: { identifier: email } })).toBe(0)
  }
  const link = await requestLink(page, fixtures.pa.email)
  await prisma.user.update({ where: { id: fixtures.pa.id }, data: { deletedAt: new Date() } })
  await page.goto(link)
  await page.goto('/pa')
  await expect(page).toHaveURL(/\/login$/)
  expect(await prisma.session.count()).toBe(0)
})

test('expired links and stale sessions lose access', async ({ page }) => {
  const expired = await requestLink(page, fixtures.pa.email)
  await prisma.verificationToken.updateMany({
    where: { identifier: fixtures.pa.email },
    data: { expires: new Date(0) },
  })
  await page.goto(expired)
  await page.goto('/pa')
  await expect(page).toHaveURL(/\/login$/)
  await login(page, fixtures.admin.email, 'admin')
  await prisma.user.update({ where: { id: fixtures.admin.id }, data: { role: 'PA' } })
  await page.goto('/admin/workshops')
  await expect(page).toHaveURL(/\/403$/)
  await prisma.user.update({ where: { id: fixtures.admin.id }, data: { deletedAt: new Date() } })
  await page.goto('/pa')
  await expect(page).toHaveURL(/\/login$/)
})

test('PA availability survives reload and can be cleared', async ({ page }) => {
  await login(page, fixtures.pa.email, 'pa')
  await page.getByRole('link', { name: 'Submit availability' }).click()
  const slot = page.getByRole('checkbox', { name: 'Monday 10:00–10:30 AM', exact: true })
  await slot.check()
  await page.getByRole('button', { name: 'Save availability' }).click()
  await expect(page.getByText('Availability saved.', { exact: true })).toBeVisible()
  await page.reload()
  await expect(slot).toBeChecked()
  await slot.uncheck()
  await page.getByRole('button', { name: 'Save availability' }).click()
  await expect.poll(() => prisma.availability.count({ where: { userId: fixtures.pa.id } })).toBe(0)
  await page.reload()
  await expect(slot).not.toBeChecked()
})

test('admin foundation forms persist schools, teachers, PAs, classes and hosting blocks', async ({
  page,
}) => {
  await login(page, fixtures.admin.email, 'admin')
  await page.goto('/admin/schools')
  await page.locator('input[name="name"]').fill('Browser School')
  await page.locator('input[name="district"]').fill('Vancouver')
  await page.getByRole('button', { name: 'Add school', exact: true }).click()
  await expect(page.getByText('Browser School', { exact: true })).toBeVisible()
  const school = await prisma.school.findFirstOrThrow({
    where: { name: 'Browser School', deletedAt: null },
  })
  await page.goto(`/admin/schools/${school.id}/edit`)
  await page.locator('input[name="name"]').fill('Browser School Updated')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Browser School Updated', { exact: true })).toBeVisible()
  await page.goto('/admin/teachers')
  await page.locator('input[name="name"]').fill('Browser Teacher')
  await page.locator('input[name="email"]').fill('browser-teacher@fixture.local')
  await page.locator('select[name="schoolId"]').selectOption(school.id)
  await page.getByRole('button', { name: 'Add teacher', exact: true }).click()
  await expect(page.getByText('Browser Teacher', { exact: true })).toBeVisible()
  const teacher = await prisma.user.findFirstOrThrow({
    where: { email: 'browser-teacher@fixture.local', deletedAt: null },
  })
  await page.goto(`/admin/teachers/${teacher.id}/edit`)
  await page.locator('input[name="name"]').fill('Browser Teacher Updated')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Browser Teacher Updated', { exact: true })).toBeVisible()
  await page.goto('/admin/pas')
  await page.locator('input[name="name"]').fill('Browser PA')
  await page.locator('input[name="email"]').fill('browser-pa@fixture.local')
  await page.getByRole('button', { name: 'Add PA', exact: true }).click()
  await expect(page.getByText('Browser PA', { exact: true })).toBeVisible()
  const pa = await prisma.user.findFirstOrThrow({
    where: { email: 'browser-pa@fixture.local', deletedAt: null },
  })
  await page.goto(`/admin/pas/${pa.id}/edit`)
  await page.locator('input[name="name"]').fill('Browser PA Updated')
  await page.getByRole('button', { name: /Save/ }).click()
  await expect(page.getByText('Browser PA Updated', { exact: true })).toBeVisible()
  await page.goto('/admin/classes')
  await page.locator('input[name="name"]').fill('Browser Class')
  await page.locator('select[name="teacherId"]').selectOption(teacher.id)
  await page.getByRole('button', { name: 'Add class', exact: true }).click()
  await expect(page.getByText('Browser Class', { exact: true })).toBeVisible()
  const cls = await prisma.classSection.findFirstOrThrow({ where: { name: 'Browser Class' } })
  await page.goto(`/admin/classes/${cls.id}/edit`)
  await page.locator('input[name="name"]').fill('Browser Class Updated')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Browser Class Updated', { exact: true })).toBeVisible()
  await page.goto(`/admin/classes/${cls.id}/edit`)
  await page.locator('select[name="dayOfWeek"]').selectOption('0')
  await page.locator('input[name="startTime"]').fill('09:00')
  await page.locator('input[name="endTime"]').fill('12:00')
  await page.getByRole('button', { name: 'Add time', exact: true }).click()
  await expect(page.getByText('Monday · 09:00–12:00', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Monday · 09:00–12:00', { exact: true })).toBeVisible()
  await page.goto(`/admin/teachers/${teacher.id}/edit`)
  await page.locator('select[name="schoolId"]').selectOption(fixtures.otherSchool.id)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'before changing their school'
  )
})

test('admin creates and reloads a draft, edits across months, and filters the month table', async ({
  page,
}) => {
  await login(page, fixtures.admin.email, 'admin')
  await page.goto('/admin/workshops?month=2027-01')
  await page.getByLabel('Class', { exact: true }).selectOption(fixtures.cls.id)
  await page.getByLabel('Vancouver date').fill('2027-01-04')
  await page.getByLabel('Start time', { exact: true }).fill('10:00')
  await page.getByLabel('End time', { exact: true }).fill('11:00')
  await page.getByRole('button', { name: 'Create draft' }).click()
  await expect(page.getByRole('status')).toHaveText('Draft saved.')
  await page.reload()
  await expect(page.getByLabel('Vancouver date')).toHaveValue('2027-01-04')
  await page.getByLabel('Vancouver date').fill('2027-02-01')
  await page.getByLabel('Start time', { exact: true }).fill('09:30')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByRole('link', { name: 'Back to 2027-02' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to 2027-02' }).click()
  await expect(page.getByRole('table')).toContainText('Fixture Biology')
  await page.screenshot({ path: 'work/workshops-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: 'Create draft' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  )
  await page.screenshot({ path: 'work/workshops-mobile.png', fullPage: true })
  await page.getByLabel('School filter').selectOption(fixtures.otherSchool.id)
  await page.getByRole('button', { name: 'Show month' }).click()
  await expect(page.getByText('No workshops in this month for these filters.')).toBeVisible()
  await page.getByLabel('School filter').selectOption('')
  await page.getByRole('button', { name: 'Show month' }).click()
  await expect(page.getByRole('table')).toContainText('draft')
  await page.getByRole('link', { name: 'Previous month' }).click()
  await expect(page.getByText('No workshops in this month for these filters.')).toBeVisible()
  await page.getByRole('link', { name: 'Next month' }).click()
  await expect(page.getByRole('table')).toContainText('Fixture Biology')
  await page.goto('/admin/workshops?month=invalid')
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Invalid month')
})

test('drafts stay private and only the assigned PA and school see published fixtures', async ({
  browser,
}) => {
  const draft = await prisma.workshop.create({
    data: {
      classSectionId: fixtures.cls.id,
      scheduledStart: vancouverToUtc('2027-01-04', 600),
      scheduledEnd: vancouverToUtc('2027-01-04', 660),
      assignments: { create: { paId: fixtures.pa.id, status: 'PUBLISHED' } },
    },
  })
  const published = await prisma.workshop.create({
    data: {
      classSectionId: fixtures.sibling.id,
      status: 'PUBLISHED',
      scheduledStart: vancouverToUtc('2027-01-11', 600),
      scheduledEnd: vancouverToUtc('2027-01-11', 660),
      assignments: { create: { paId: fixtures.pa.id, status: 'PUBLISHED' } },
    },
  })
  for (const [user, role, visible] of [
    [fixtures.teacher, 'teacher', true],
    [fixtures.otherTeacher, 'teacher', false],
    [fixtures.pa, 'pa', true],
  ] as const) {
    const context = await browser.newContext()
    const page = await context.newPage()
    await login(page, user.email, role)
    await expect(page.getByText('Fixture Biology', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Fixture Chemistry', { exact: true })).toHaveCount(visible ? 1 : 0)
    for (const id of [draft.id, published.id]) {
      await page.goto(`/admin/workshops/${id}`)
      await expect(page).toHaveURL(/\/403$/)
    }
    await context.close()
  }
})
