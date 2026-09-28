import { createSessionFixture } from '../fixtures'
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
        '/admin/admins',
        '/admin/classes',
        '/admin/workshops',
        '/admin/workshops/plan',
        '/admin/workshops/match',
        '/admin/workshops/match/unavailable',
        '/admin/workshops/changes/unavailable',
        '/admin/staffing',
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
    await page.getByRole('button', { name: 'Send sign-in link' }).click()
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
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, fixtures.pa.email, 'pa')
  await page.getByRole('link', { name: 'Submit availability' }).click()
  const editor = page.getByRole('region', { name: 'Availability editor' })
  await editor.getByLabel('From', { exact: true }).selectOption('600')
  await editor.getByLabel('Until', { exact: true }).selectOption('660')
  await editor.getByRole('checkbox', { name: 'Friday', exact: true }).press('Space')
  await editor.getByRole('button', { name: 'Add time range', exact: true }).click()
  await page.getByRole('button', { name: 'Save availability', exact: true }).click()
  await expect(page.getByText('Availability saved.', { exact: true })).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Remove Monday 10:00–11:00 AM', exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Remove Friday 10:00–11:00 AM', exact: true })
  ).toBeVisible()
  await expect(page.getByText('Edit individual 15-minute slots', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Availability calendar' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Clear all', exact: true }).click()
  await page.getByRole('button', { name: 'Save availability', exact: true }).click()
  await expect.poll(() => prisma.availability.count({ where: { userId: fixtures.pa.id } })).toBe(0)
  await page.reload()
  await expect(page.getByText('No weekly times added.', { exact: true })).toBeVisible()
})

test('admin foundation forms persist schools, teachers, PAs and teacher availability', async ({
  page,
}) => {
  await login(page, fixtures.admin.email, 'admin')
  await page.goto('/admin/schools')
  await page.locator('input[name="name"]').fill('Browser School')
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
  await expect(page.getByRole('heading', { name: 'Browser Teacher', exact: true })).toBeVisible()
  const teacher = await prisma.user.findFirstOrThrow({
    where: { email: 'browser-teacher@fixture.local', deletedAt: null },
  })
  await page.goto(`/admin/teachers/${teacher.id}/edit`)
  await page.locator('input[name="name"]').fill('Browser Teacher Updated')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Browser Teacher Updated', exact: true })
  ).toBeVisible()
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
  await page.goto('/admin/admins')
  await page.locator('input[name="name"]').fill('Browser Admin')
  await page.locator('input[name="email"]').fill('BROWSER-ADMIN@fixture.local')
  await page.getByRole('button', { name: 'Add admin', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Admin added')
  await expect(page.getByText('Browser Admin', { exact: true })).toBeVisible()
  expect(
    await prisma.user.count({
      where: { email: 'browser-admin@fixture.local', role: 'ADMIN', deletedAt: null },
    })
  ).toBe(1)
  const cls = await prisma.classSection.findUniqueOrThrow({ where: { teacherId: teacher.id } })
  expect(cls.name).toBe('Browser Teacher Updated')
  expect(await prisma.classSection.count({ where: { teacherId: teacher.id } })).toBe(1)
  await page.goto(`/admin/teachers/${teacher.id}`)
  await page.getByText('Add weekly time', { exact: true }).click()
  const recurring = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Save weekly time', exact: true }) })
  await recurring.getByRole('checkbox', { name: 'Monday', exact: true }).check()
  await recurring.getByLabel('From', { exact: true }).fill('09:00')
  await recurring.getByLabel('Until', { exact: true }).fill('12:00')
  await recurring.getByRole('button', { name: 'Save weekly time', exact: true }).click()
  await expect(page.getByText(/Monday · 9:00 AM–12:00 PM/)).toBeVisible()
  await page.reload()
  await expect(page.getByText(/Monday · 9:00 AM–12:00 PM/)).toBeVisible()
  await page.goto(`/admin/teachers/${teacher.id}/edit`)
  await page.locator('select[name="schoolId"]').selectOption(fixtures.otherSchool.id)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'This teacher has a saved schedule'
  )
})

test('admin creates and reloads a draft, edits across months, and filters the month table', async ({
  page,
}) => {
  await login(page, fixtures.admin.email, 'admin')
  await page.goto('/admin/workshops?month=2027-01')
  await page
    .getByRole('link', { name: 'Schedule a confirmed teacher session', exact: true })
    .click()
  await page.getByLabel('Workshop', { exact: true }).selectOption('fixture-definition-1')
  await page.getByLabel('Choose or add a school').selectOption(fixtures.school.id)
  await page.getByLabel('Choose or add a teacher').selectOption(fixtures.teacher.id)
  await page.getByLabel('Vancouver date').fill('2027-01-04')
  await page.getByLabel('Start time', { exact: true }).fill('10:00')
  await page.getByLabel('End time', { exact: true }).fill('11:00')
  await page.getByRole('button', { name: 'Schedule teacher session' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved.' })).toHaveText(
    'Draft saved.'
  )
  await page.reload()
  await page.getByText('Edit date and details', { exact: true }).click()
  const editDraftForm = page.locator('form').filter({
    has: page.getByRole('button', { name: 'Save draft', exact: true }),
  })
  await expect(editDraftForm.getByLabel('Vancouver date')).toHaveValue('2027-01-04')
  const sessionUrl = page.url()
  await page.getByRole('link', { name: 'Included teacher and availability' }).click()
  const availabilityForm = page.locator('form').filter({
    has: page.getByRole('button', { name: 'Add availability', exact: true }),
  })
  await availabilityForm.getByLabel('Date', { exact: true }).fill('2027-02-01')
  await availabilityForm.getByLabel('Start time', { exact: true }).fill('09:30')
  await availabilityForm.getByLabel('End time', { exact: true }).fill('11:00')
  await availabilityForm.getByRole('button', { name: 'Add availability', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Feb 1/ })).toBeVisible()
  await page.goto(sessionUrl)
  await page.getByText('Edit date and details', { exact: true }).click()
  const reloadedEditDraftForm = page.locator('form').filter({
    has: page.getByRole('button', { name: 'Save draft', exact: true }),
  })
  await reloadedEditDraftForm.getByLabel('Vancouver date').fill('2027-02-01')
  await reloadedEditDraftForm.getByLabel('Start time', { exact: true }).fill('09:30')
  await reloadedEditDraftForm.getByRole('button', { name: 'Save draft' }).click()
  await expect
    .poll(async () => {
      const saved = await prisma.workshopSession.findFirstOrThrow()
      return saved.scheduledStart.toISOString()
    })
    .toBe(vancouverToUtc('2027-02-01', 570).toISOString())
  await expect(page.getByRole('link', { name: 'Back to Workshop 1 schedule' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to Workshop 1 schedule' }).click()
  await expect(page.getByRole('table')).toContainText('Fixture Biology')
  await page.goto('/admin/workshops?month=2027-02')
  await expect(page).toHaveURL(/month=2027-02/)
  await expect(page.getByRole('table')).toContainText('Fixture Biology')
  await page.screenshot({ path: 'work/workshops-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(
    page.getByRole('link', { name: 'Schedule a confirmed teacher session', exact: true })
  ).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  )
  await page.screenshot({ path: 'work/workshops-mobile.png', fullPage: true })
  await page.getByLabel('School filter').selectOption(fixtures.otherSchool.id)
  await expect(page.getByText('No teacher sessions in this month for these filters.')).toBeVisible()
  await page.getByLabel('School filter').selectOption('')
  await expect(page.getByRole('table')).toContainText('draft')
  await page.getByRole('link', { name: 'Previous month' }).click()
  await expect(page.getByText('No teacher sessions in this month for these filters.')).toBeVisible()
  await page.getByRole('link', { name: 'Next month' }).click()
  await expect(page.getByRole('table')).toContainText('Fixture Biology')
  await page.goto('/admin/workshops?month=invalid')
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Invalid month')
})

test('drafts stay private and only the assigned PA and school see published fixtures', async ({
  browser,
}) => {
  const draft = await createSessionFixture({
    data: {
      classSectionId: fixtures.cls.id,
      scheduledStart: vancouverToUtc('2027-01-04', 600),
      scheduledEnd: vancouverToUtc('2027-01-04', 660),
      assignments: { create: { paId: fixtures.pa.id, status: 'PUBLISHED' } },
    },
  })
  const published = await createSessionFixture({
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
