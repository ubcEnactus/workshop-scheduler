import { createSessionFixture, addCandidateFixture } from '../fixtures'
import { mkdir } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { prisma } from '../../src/lib/db'
import { resetFixtures } from '../fixtures'
import { vancouverToUtc } from '../../src/lib/time'
import { login } from './helpers'
test.afterAll(async () => {
  await prisma.$disconnect()
})
async function ready() {
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
  return { ...f, workshop }
}
test('auto-fills the saved workshop draft and reaches availability and workload from PAs', async ({
  page,
}) => {
  const f = await ready()
  const definitionId = (
    await prisma.workshopSession.findUniqueOrThrow({
      where: { id: f.workshop.id },
      select: { classWorkshop: { select: { workshopDefinitionId: true } } },
    })
  ).classWorkshop.workshopDefinitionId
  await login(page, f.admin.email, 'admin')
  await page.goto(`/admin/workshop-definitions/${definitionId}`)
  await page
    .getByRole('navigation', { name: 'Workshop workflow' })
    .getByRole('link', { name: '2. Staff', exact: true })
    .click()
  const draft = page.locator(`#session-${f.workshop.id}`)
  await expect(draft.getByRole('heading', { name: 'Fixture Biology' })).toBeVisible()
  await expect(draft.getByText(/Fixture School/)).toBeVisible()
  await page.getByRole('button', { name: 'Auto-fill missing PAs (1)', exact: true }).click()
  await expect(draft.getByText('1 assigned · 1 required')).toBeVisible()
  expect(
    await prisma.assignment.count({
      where: { workshopSessionId: f.workshop.id, source: 'AUTOMATIC' },
    })
  ).toBe(1)
  await expect(page).toHaveURL(
    new RegExp(`/admin/workshop-definitions/${definitionId}\\?step=staff`)
  )
  await page.goto('/admin/pas')
  await page.getByRole('link', { name: 'Availability & workload', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Availability & workload', exact: true })
  ).toBeVisible()
  await expect(page.getByText(/Monthly quotas are not required for assignment/)).toBeVisible()
  await expect(page.getByRole('row', { name: /Fixture PA/ })).toContainText(
    '4 effective 15-minute slot records'
  )
  await page.getByRole('link', { name: 'Calendar', exact: true }).last().click()
  await expect(page).toHaveURL(/\/admin\/workshops\?/)
})

test('finishing a needs-PAs row keeps it in Publish and retains exact session scope', async ({
  page,
}) => {
  const f = await ready()
  const { workshopDefinitionId } = await prisma.classWorkshop.findUniqueOrThrow({
    where: { id: f.workshop.classWorkshopId },
  })
  const otherEnrollment = await prisma.classWorkshop.create({
    data: {
      workshopDefinitionId,
      classSectionId: f.sibling.id,
      availabilitySlots: {
        create: {
          start: vancouverToUtc('2027-01-11', 600),
          end: vancouverToUtc('2027-01-11', 660),
        },
      },
    },
  })
  const other = await prisma.workshopSession.create({
    data: {
      classWorkshopId: otherEnrollment.id,
      scheduledStart: vancouverToUtc('2027-01-11', 600),
      scheduledEnd: vancouverToUtc('2027-01-11', 660),
      minPAs: 1,
      maxPAs: 1,
      assignments: { create: { paId: f.pa.id, status: 'DRAFT', source: 'MANUAL' } },
    },
  })
  await login(page, f.admin.email, 'admin')
  await page.goto(
    `/admin/workshop-definitions/${workshopDefinitionId}?step=staff&filter=needs-pas&sessionId=${f.workshop.id}&week=2027-01-04`
  )
  const target = page.locator(`#session-${f.workshop.id}`)
  await target.getByRole('button', { name: 'Assign Fixture PA', exact: true }).click()
  await expect(target.getByText('Ready to publish', { exact: true })).toBeVisible()
  await expect(target.getByRole('button', { name: 'Remove Fixture PA', exact: true })).toBeVisible()
  await expect(page.locator(`#session-${other.id}`)).toHaveCount(0)
  await page
    .getByRole('navigation', { name: 'Workshop workflow' })
    .getByRole('link', { name: '3. Publish', exact: true })
    .click()
  await expect(page).toHaveURL(
    (url) => url.searchParams.get('step') === 'publish' && !url.searchParams.has('filter')
  )
  const url = new URL(page.url())
  expect(url.searchParams.get('filter')).toBeNull()
  expect(url.searchParams.getAll('sessionId')).toEqual([f.workshop.id])
  expect(url.searchParams.get('week')).toBe('2027-01-04')
  await expect(target.getByText('Ready to publish', { exact: true })).toBeVisible()
  await expect(page.locator(`#session-${other.id}`)).toHaveCount(0)
  await page.getByRole('button', { name: 'Select all ready', exact: true }).click()
  await page.getByRole('button', { name: 'Publish 1 session', exact: true }).click()
  await expect(page.getByText(/^1 teacher session published\./)).toBeVisible()
  expect(
    await prisma.workshopSession.findUniqueOrThrow({ where: { id: f.workshop.id } })
  ).toMatchObject({ status: 'PUBLISHED' })
  expect(await prisma.workshopSession.findUniqueOrThrow({ where: { id: other.id } })).toMatchObject(
    { status: 'DRAFT', version: other.version }
  )
})
test('staffs in place, restores keyboard focus and publishes through a reviewed selection', async ({
  page,
}) => {
  const f = await ready()
  await login(page, f.admin.email, 'admin')
  await page.goto('/admin/workshops?month=2027-01')
  await mkdir('work/ux-implementation', { recursive: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  const staff = page.getByRole('button', { name: 'Staff Fixture Biology', exact: true })
  expect((await staff.boundingBox())!.y).toBeLessThan(900)
  await staff.click()
  const dialog = page.getByRole('dialog', { name: 'Staff Fixture Biology', exact: true })
  await dialog.getByRole('button', { name: 'Close', exact: true }).focus()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.locator('summary').filter({ hasText: /^Blocked PAs \(0\)$/ })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
  await dialog.getByRole('button', { name: 'Assign Fixture PA', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Remove Fixture PA', exact: true })).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/admin/workshops')
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.screenshot({ path: 'work/ux-implementation/staffing-panel.png', fullPage: true })
  await page.keyboard.press('Escape')
  await expect(staff).toBeFocused()
  await page.getByRole('checkbox', { name: /Select Fixture Biology .* for publication/ }).check()
  await page.getByRole('button', { name: 'Review publication (1)' }).click()
  await expect(page.getByRole('dialog')).toContainText('Ready to publish')
  await page.getByRole('button', { name: 'Publish selected teacher sessions' }).click()
  await expect(page.getByText(/^1 teacher session published\./)).toBeVisible()
  expect(
    (await prisma.workshopSession.findUniqueOrThrow({ where: { id: f.workshop.id } })).status
  ).toBe('PUBLISHED')
  await page.screenshot({ path: 'work/ux-implementation/month-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.screenshot({ path: 'work/ux-implementation/month-mobile.png', fullPage: true })
  for (const width of [900, 720]) {
    await page.setViewportSize({ width, height: 450 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.getByRole('link', { name: 'Details', exact: true })).toBeVisible()
  }
})

test('bulk review blocks unstaffed drafts and recovers from a stale eligibility snapshot', async ({
  page,
}) => {
  const f = await ready()
  await prisma.assignment.create({
    data: { workshopSessionId: f.workshop.id, paId: f.pa.id, status: 'DRAFT', source: 'MANUAL' },
  })
  await createSessionFixture({
    data: {
      classSectionId: f.cls.id,
      scheduledStart: vancouverToUtc('2027-01-11', 600),
      scheduledEnd: vancouverToUtc('2027-01-11', 660),
      minPAs: 1,
      maxPAs: 1,
    },
  })
  await login(page, f.admin.email, 'admin')
  await page.goto('/admin/workshops?month=2027-01')
  await page
    .getByRole('checkbox', { name: /Select Fixture Biology .*Jan 11.* for publication/ })
    .check()
  await page.getByRole('button', { name: 'Review publication (1)' }).click()
  await expect(
    page.getByRole('button', { name: 'Publish selected teacher sessions' })
  ).toBeDisabled()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Select ready drafts', exact: true }).click()
  await expect(
    page.getByRole('checkbox', { name: /Select Fixture Biology .*Jan 11.* for publication/ })
  ).not.toBeChecked()
  await page.getByRole('button', { name: 'Review publication (1)' }).click()
  await prisma.availability.create({
    data: { userId: f.pa.id, dayOfWeek: 0, startMin: 660 },
  })
  await page.getByRole('button', { name: 'Publish selected teacher sessions' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('eligibility changed')
  expect(await prisma.workshopSession.count({ where: { status: 'PUBLISHED' } })).toBe(0)
  let releaseRefresh = () => {}
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve
  })
  let refreshRequested = false
  await page.route('**/admin/workshops?**', async (route) => {
    if (route.request().headers()['rsc'] !== '1') return route.continue()
    const response = await route.fetch()
    refreshRequested = true
    await refreshGate
    await route.fulfill({ response })
  })
  try {
    await page.getByRole('button', { name: 'Reload schedule', exact: true }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await expect.poll(() => refreshRequested).toBe(true)
    await expect(page.getByRole('button', { name: 'Review publication (1)' })).toBeDisabled()
    await expect(
      page.getByRole('button', { name: 'Staff Fixture Biology', exact: true }).first()
    ).toBeDisabled()
  } finally {
    releaseRefresh()
  }
  await expect(page.getByRole('button', { name: 'Review publication (1)' })).toBeEnabled()
  await page.unroute('**/admin/workshops?**')
  await page.getByRole('button', { name: 'Staff Fixture Biology', exact: true }).first().click()
  await expect(page.getByRole('dialog')).toContainText('Assigned PAs (1/1–1)')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Review publication (1)' }).click()
  await page.getByRole('button', { name: 'Publish selected teacher sessions' }).click()
  await expect(page.getByText(/^1 teacher session published\./)).toBeVisible()
  await expect(page.getByRole('heading', { name: /Monthly schedule/ })).toBeFocused()
  expect(await prisma.workshopSession.count({ where: { status: 'PUBLISHED' } })).toBe(1)
})
test('auto-fill needs no quota and ranks the lower lifetime workload first', async ({ page }) => {
  const f = await ready()
  const lessAssigned = await prisma.user.create({
    data: { role: 'PA', name: 'Fairness PA', email: 'fairness-pa@fixture.local' },
  })
  await prisma.availability.createMany({
    data: [600, 615, 630, 645].map((startMin) => ({
      userId: lessAssigned.id,
      dayOfWeek: 0,
      startMin,
    })),
  })
  await createSessionFixture({
    data: {
      classSectionId: f.cls.id,
      status: 'COMPLETED',
      scheduledStart: vancouverToUtc('2026-12-07', 600),
      scheduledEnd: vancouverToUtc('2026-12-07', 660),
      assignments: { create: { paId: f.pa.id, status: 'PUBLISHED' } },
    },
  })
  await login(page, f.admin.email, 'admin')
  await page.goto('/admin/staffing?month=2027-01')
  await expect(page.getByText(/Monthly quotas are not required for assignment/)).toBeVisible()
  await expect(page.getByText(/Lifetime totals guide fair ranking only/)).toBeVisible()
  await expect(page.getByText(/Quota/)).toHaveCount(0)
  const { workshopDefinitionId } = await prisma.classWorkshop.findUniqueOrThrow({
    where: { id: f.workshop.classWorkshopId },
  })
  await page.goto(`/admin/workshop-definitions/${workshopDefinitionId}?step=staff`)
  await page.getByRole('button', { name: 'Auto-fill missing PAs (1)', exact: true }).click()
  const target = page.locator(`#session-${f.workshop.id}`)
  await expect(
    target.getByRole('button', { name: 'Remove Fairness PA', exact: true })
  ).toBeVisible()
  await expect(target.getByRole('button', { name: 'Remove Fixture PA', exact: true })).toHaveCount(
    0
  )
  await expect
    .poll(async () =>
      prisma.assignment.count({
        where: { workshopSessionId: f.workshop.id, paId: lessAssigned.id, status: 'DRAFT' },
      })
    )
    .toBe(1)
  expect(
    await prisma.monthlyPAQuota.count({
      where: { paId: { in: [f.pa.id, lessAssigned.id] } },
    })
  ).toBe(0)
})
test('mobile PA ranges copy across the week, support undo and persist without the grid', async ({
  page,
}) => {
  const f = await resetFixtures()
  await login(page, f.pa.email, 'pa')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/pa/availability')
  const editor = page.getByRole('region', { name: 'Availability editor' })
  await editor.getByLabel('From', { exact: true }).selectOption('540')
  await editor.getByLabel('Until', { exact: true }).selectOption('720')
  await editor.getByRole('button', { name: 'Add time range', exact: true }).click()
  for (const day of ['Tuesday', 'Wednesday', 'Thursday', 'Friday'])
    await page.getByRole('checkbox', { name: day, exact: true }).check()
  await page.getByRole('button', { name: 'Copy to selected days' }).click()
  await page.getByRole('button', { name: 'Clear this day', exact: true }).click()
  await page.getByRole('button', { name: 'Undo last edit' }).click()
  await page.getByRole('button', { name: 'Save availability', exact: true }).click()
  await expect(page.getByText('Availability saved.', { exact: true })).toBeVisible()
  expect(await prisma.availability.count()).toBe(60)
  await page.reload()
  await expect(page.getByText(/15 hours per week/)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await mkdir('work/ux-implementation', { recursive: true })
  await page.screenshot({ path: 'work/ux-implementation/availability-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Clear all', exact: true }).click()
  await page.getByRole('button', { name: 'Save availability', exact: true }).click()
  await expect.poll(() => prisma.availability.count()).toBe(0)
})
test('planning suggests and saves intentional class and teacher overlaps', async ({ page }) => {
  const f = await resetFixtures()
  await prisma.classMeeting.deleteMany({
    where: { classSectionId: { in: [f.cls.id, f.sibling.id] } },
  })
  await prisma.workshopDefinition.update({
    where: { id: 'fixture-definition-1' },
    data: {
      deliveryStartsOn: new Date('2027-01-04T00:00:00.000Z'),
      deliveryEndsOn: new Date('2027-01-11T00:00:00.000Z'),
    },
  })
  await addCandidateFixture(f.cls.id, '2027-01-04')
  await addCandidateFixture(f.sibling.id, '2027-01-04')
  await addCandidateFixture(f.sibling.id, '2027-01-05')
  await createSessionFixture({
    data: {
      classSectionId: f.cls.id,
      scheduledStart: vancouverToUtc('2027-01-04', 600),
      scheduledEnd: vancouverToUtc('2027-01-04', 660),
    },
  })
  await login(page, f.admin.email, 'admin')
  await page.goto('/admin/workshops/plan?workshopDefinitionId=fixture-definition-1')
  const biology = page.getByLabel('Fixture School · Fixture Biology date and time', {
    exact: true,
  })
  const chemistry = page.getByLabel('Fixture School · Fixture Chemistry date and time', {
    exact: true,
  })
  const biologyConflict = await biology
    .locator('option')
    .filter({ hasText: /Jan 4.*10:00/ })
    .first()
    .getAttribute('value')
  const chemistryConflict = await chemistry
    .locator('option')
    .filter({ hasText: /Jan 4.*10:00/ })
    .first()
    .getAttribute('value')
  expect(biologyConflict).not.toBeNull()
  expect(chemistryConflict).not.toBeNull()
  await biology.selectOption(biologyConflict!)
  await chemistry.selectOption(chemistryConflict!)
  await page.getByRole('button', { name: 'Save dates & continue', exact: true }).click()
  await expect(page).toHaveURL(/batch=/)
  expect(
    await prisma.workshopSession.count({
      where: {
        scheduledStart: vancouverToUtc('2027-01-04', 600),
        scheduledEnd: vancouverToUtc('2027-01-04', 660),
      },
    })
  ).toBe(3)
})

test('ad hoc creation keeps run defaults through host selection and preserves invalid input', async ({
  page,
}) => {
  const f = await resetFixtures()
  await Promise.all([
    prisma.classSection.update({
      where: { id: f.cls.id },
      data: { defaultDurationMinutes: 90, defaultMinPAs: 4, defaultMaxPAs: 6 },
    }),
    prisma.workshopDefinition.update({
      where: { id: 'fixture-definition-1' },
      data: { durationMinutes: 75, defaultMinPAs: 2, defaultMaxPAs: 3 },
    }),
  ])
  await login(page, f.admin.email, 'admin')
  await page.goto('/admin/workshops?month=2027-01&schoolId=missing&classSectionId=missing')
  await expect(page.getByRole('main').getByRole('alert')).toContainText('filter was cleared')
  await page
    .getByRole('link', { name: 'Schedule a confirmed teacher session', exact: true })
    .click()
  await page.getByLabel('Workshop', { exact: true }).selectOption('fixture-definition-1')
  await page.getByLabel('Choose or add a school').selectOption(f.school.id)
  await page.getByLabel('Choose or add a teacher').selectOption(f.teacher.id)
  await page.getByText('Advanced staffing', { exact: true }).click()
  await expect(page.getByLabel('Minimum PAs', { exact: true })).toHaveValue('2')
  await expect(page.getByLabel('Maximum PAs', { exact: true })).toHaveValue('3')
  await page.getByLabel('Vancouver date').fill('2027-01-04')
  await page.getByLabel('Start time', { exact: true }).fill('09:00')
  await expect(page.getByLabel('End time', { exact: true })).toHaveValue('10:15')
  await page.getByLabel('Choose or add a school').selectOption(f.otherSchool.id)
  await expect(page.getByLabel('Minimum PAs', { exact: true })).toHaveValue('2')
  await expect(page.getByLabel('Maximum PAs', { exact: true })).toHaveValue('3')
  await expect(page.getByLabel('End time', { exact: true })).toHaveValue('10:15')
  await page.getByLabel('Workshop', { exact: true }).selectOption('fixture-definition-1')
  await page.getByLabel('Choose or add a school').selectOption(f.school.id)
  await page.getByLabel('Choose or add a teacher').selectOption(f.teacher.id)
  await page.getByLabel('End time', { exact: true }).fill('08:00')
  await page.getByRole('button', { name: 'Schedule teacher session', exact: true }).click()
  await expect(page.getByRole('main').getByRole('alert').last()).toContainText(
    'End time must be after'
  )
  await expect(page.getByLabel('End time', { exact: true })).toHaveValue('08:00')
  await page.getByLabel('End time', { exact: true }).fill('10:30')
  await page.getByRole('button', { name: 'Schedule teacher session', exact: true }).click()
  await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible()
})
