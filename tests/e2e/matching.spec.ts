import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { prisma } from '../../src/lib/db'
import { vancouverToUtc } from '../../src/lib/time'
import { addCandidateFixture, createSessionFixture, resetFixtures } from '../fixtures'
import { login } from './helpers'

test.afterAll(() => prisma.$disconnect())

async function draftFixture() {
  const f = await resetFixtures()
  await prisma.availability.createMany({
    data: [0, 1].flatMap((dayOfWeek) =>
      [600, 615, 630, 645].map((startMin) => ({ userId: f.pa.id, dayOfWeek, startMin }))
    ),
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
  return { ...f, session, href: '/admin/workshop-definitions/fixture-definition-1?step=staff' }
}

test('auto-fill saves only the minimum, supports persistent Undo, and preserves manual choices on rerun', async ({
  page,
}) => {
  const f = await draftFixture()
  await login(page, f.admin.email, 'admin')
  await page.goto('/admin/workshops/match?workshopDefinitionId=fixture-definition-1')
  await expect(page).toHaveURL(f.href)
  const card = page.locator(`#session-${f.session.id}`)
  await page.getByRole('button', { name: 'Auto-fill missing PAs (1)' }).click()
  await expect(card.getByRole('button', { name: 'Remove Fixture PA' })).toBeVisible()
  expect(await prisma.assignment.count()).toBe(1)
  expect(
    await prisma.workshopSession.findUniqueOrThrow({ where: { id: f.session.id } })
  ).toMatchObject({ locked: false, scheduledStart: f.session.scheduledStart })
  await page.reload()
  await page.getByText('Recent draft activity', { exact: true }).click()
  await page.getByRole('button', { name: /^Undo Added 1 PA assignment/ }).click()
  await expect(card.getByText('No PAs assigned.', { exact: true })).toBeVisible()
  expect(await prisma.assignment.count()).toBe(0)
  await card.getByText('Add PA', { exact: true }).click()
  await card.getByRole('button', { name: 'Assign Fixture PA', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(card.getByRole('button', { name: 'Remove Fixture PA' })).toBeVisible()
  expect(await prisma.assignment.findFirstOrThrow()).toMatchObject({
    source: 'MANUAL',
    paId: f.pa.id,
  })
  expect(
    await prisma.workshopSession.findUniqueOrThrow({ where: { id: f.session.id } })
  ).toMatchObject({ locked: false })
  await card.getByRole('button', { name: 'Remove Fixture PA' }).click()
  await expect(card.getByText('Excluded from auto-fill for this session.')).toBeVisible()
  await page.getByRole('button', { name: 'Select sessions needing PAs' }).click()
  await page.getByRole('button', { name: 'Auto-fill missing PAs (1)' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'No PAs added.' })).toBeVisible()
  expect(await prisma.assignment.count()).toBe(0)
  await card.getByRole('button', { name: 'Allow auto-fill for Fixture PA' }).click()
  await expect(card.getByText('Excluded from auto-fill for this session.')).toHaveCount(0)
  await page.getByRole('button', { name: 'Auto-fill missing PAs (1)' }).click()
  await expect(card.getByRole('button', { name: 'Remove Fixture PA' })).toBeVisible()
  expect(await prisma.assignment.count()).toBe(1)
  await page.getByRole('link', { name: '3. Publish', exact: true }).click()
  await page.getByRole('button', { name: 'Select all ready' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Publish 1 session', exact: true }).click()
  await expect
    .poll(() => prisma.workshopSession.findUniqueOrThrow({ where: { id: f.session.id } }))
    .toMatchObject({ status: 'PUBLISHED', scheduledStart: f.session.scheduledStart })
})

for (const sameDay of [false, true]) {
  test(`saved draft adds directly despite ${sameDay ? 'same-day and weekly' : 'weekly'} workload warnings without expiry`, async ({
    page,
  }) => {
    const f = await draftFixture()
    const existing = await createSessionFixture({
      data: {
        classSectionId: f.sibling.id,
        scheduledStart: vancouverToUtc(sameDay ? '2027-01-04' : '2027-01-05', sameDay ? 480 : 600),
        scheduledEnd: vancouverToUtc(sameDay ? '2027-01-04' : '2027-01-05', sameDay ? 540 : 660),
        status: 'COMPLETED',
        minPAs: 1,
        maxPAs: 1,
      },
    })
    await prisma.assignment.create({
      data: {
        workshopSessionId: existing.id,
        paId: f.pa.id,
        source: 'MANUAL',
        status: 'PUBLISHED',
      },
    })
    await login(page, f.admin.email, 'admin')
    await page.goto(f.href)
    const card = page.locator(`#session-${f.session.id}`)
    await card.getByText('Add PA', { exact: true }).click()
    const candidate = card.getByRole('group', { name: 'Fixture PA', exact: true })
    await expect(
      candidate.getByText('Already assigned another session in this Monday–Friday week.', {
        exact: false,
      })
    ).toBeVisible()
    if (sameDay)
      await expect(
        candidate.getByText('Already assigned another session on this day.', { exact: false })
      ).toBeVisible()
    await expect(candidate.getByRole('checkbox')).toHaveCount(0)
    await expect(candidate.getByRole('textbox', { name: /reason/i })).toHaveCount(0)
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await candidate.screenshot({
      path: `work/workspace-warning-${sameDay ? 'day' : 'week'}-mobile.png`,
    })
    // Actual draft work has no proposal expiry or second approval after time passes.
    await page.clock.install()
    await page.clock.fastForward(16 * 60_000)
    await candidate.getByRole('button', { name: 'Assign Fixture PA', exact: true }).click()
    await expect(card.getByRole('button', { name: 'Remove Fixture PA' })).toBeVisible()
    expect(
      await prisma.assignment.findFirstOrThrow({ where: { workshopSessionId: f.session.id } })
    ).toMatchObject({
      source: 'MANUAL',
      overrideWeek: true,
      overrideSameDay: sameDay,
      overrideReason: null,
    })
    expect(await prisma.matchingPreview.count()).toBe(0)
  })
}

test('auto-fill leaves a real shortage editable and publish selects only ready sessions', async ({
  page,
}) => {
  const f = await draftFixture()
  const enrollment = await addCandidateFixture(f.sibling.id, '2027-01-05')
  const second = await prisma.workshopSession.create({
    data: {
      classWorkshopId: enrollment.classWorkshopId,
      scheduledStart: vancouverToUtc('2027-01-05', 600),
      scheduledEnd: vancouverToUtc('2027-01-05', 660),
      minPAs: 1,
      maxPAs: 1,
    },
  })
  await login(page, f.admin.email, 'admin')
  await page.goto(f.href)
  await page.getByRole('button', { name: 'Auto-fill missing PAs (2)' }).click()
  await expect.poll(() => prisma.assignment.count()).toBe(1)
  await expect(page.getByText('Ready to publish', { exact: true })).toHaveCount(1)
  await expect(page.getByText('Needs 1 PA', { exact: true })).toHaveCount(1)
  expect(await prisma.matchingPreview.count()).toBe(0)
  await page.getByRole('link', { name: '3. Publish', exact: true }).click()
  await page.getByRole('button', { name: 'Select all ready' }).click()
  await expect(page.getByRole('button', { name: 'Publish 1 session', exact: true })).toBeEnabled()
  await page.getByText('Unfinished sessions (1)', { exact: true }).click()
  await expect(page.getByText('Minimum staffing is not met.', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.screenshot({ path: 'work/workspace-publish-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Publish 1 session', exact: true }).click()
  await expect.poll(() => prisma.workshopSession.count({ where: { status: 'PUBLISHED' } })).toBe(1)
  expect(await prisma.workshopSession.count({ where: { status: 'DRAFT' } })).toBe(1)
  expect(
    (await prisma.workshopSession.findUniqueOrThrow({ where: { id: f.session.id } })).scheduledStart
  ).toEqual(f.session.scheduledStart)
  expect(
    (await prisma.workshopSession.findUniqueOrThrow({ where: { id: second.id } })).scheduledStart
  ).toEqual(second.scheduledStart)
})

test('an uncertain saved assignment disables navigation and retries the same command after reload', async ({
  page,
}) => {
  const f = await draftFixture()
  await login(page, f.admin.email, 'admin')
  await page.goto(f.href)
  const card = page.locator(`#session-${f.session.id}`)
  await card.getByText('Add PA', { exact: true }).click()
  let intercepted = false
  await page.route('**/admin/workshop-definitions/fixture-definition-1**', async (route) => {
    if (route.request().method() !== 'POST' || intercepted) return route.continue()
    intercepted = true
    await route.fetch()
    await route.abort('failed')
  })
  await card.getByRole('button', { name: 'Assign Fixture PA', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Retry and check save' })).toBeVisible()
  expect(await prisma.assignment.count()).toBe(1)
  const publish = page.getByRole('link', { name: '3. Publish', exact: true })
  await expect(publish).toHaveAttribute('aria-disabled', 'true')
  await publish.click({ force: true })
  await expect(page).toHaveURL(f.href)
  await expect(page.getByRole('button', { name: 'Select sessions needing PAs' })).toBeDisabled()
  await page.unroute('**/admin/workshop-definitions/fixture-definition-1**')
  page.on('dialog', (dialog) => dialog.accept())
  await page.reload()
  await expect(page.getByRole('button', { name: 'Retry and check save' })).toBeVisible()
  await page.getByRole('button', { name: 'Retry and check save' }).click()
  await expect(page.getByRole('button', { name: 'Retry and check save' })).toHaveCount(0)
  await expect(card.getByRole('button', { name: 'Remove Fixture PA' })).toBeVisible()
  expect(await prisma.assignment.count()).toBe(1)
  expect(await prisma.draftStaffingOperation.count()).toBe(1)
  await expect(publish).not.toHaveAttribute('aria-disabled', 'true')
})

test('calendar drawer reconciles a lost save after reload before allowing another edit', async ({
  page,
}) => {
  const f = await draftFixture()
  await login(page, f.admin.email, 'admin')
  await page.goto('/admin/workshops?month=2027-01')
  await page.getByRole('button', { name: 'Staff Fixture Biology', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Staff Fixture Biology', exact: true })
  let intercepted = false
  await page.route('**/admin/workshops?**', async (route) => {
    if (route.request().method() !== 'POST' || intercepted) return route.continue()
    intercepted = true
    await route.fetch()
    await route.abort('failed')
  })
  await drawer.getByRole('button', { name: 'Assign Fixture PA', exact: true }).click()
  await expect(drawer.getByRole('button', { name: 'Retry and check save' })).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Close', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(drawer).toBeVisible()
  expect(await prisma.assignment.count()).toBe(1)
  await page.unroute('**/admin/workshops?**')
  page.on('dialog', (dialog) => dialog.accept())
  await page.reload()
  await expect(drawer).toBeVisible()
  await drawer.getByRole('button', { name: 'Retry and check save' }).click()
  await expect(drawer.getByRole('button', { name: 'Close', exact: true })).toBeEnabled()
  await expect(drawer.getByRole('button', { name: 'Retry and check save' })).toHaveCount(0)
  expect(await prisma.assignment.count()).toBe(1)
  expect(await prisma.draftStaffingOperation.count()).toBe(1)
  await drawer.getByRole('button', { name: 'Undo last staffing change' }).click()
  await expect(drawer.getByRole('button', { name: 'Assign Fixture PA', exact: true })).toBeEnabled()
  expect(await prisma.assignment.count()).toBe(0)
})

test('session detail acknowledges a slow duplicate save without duplicating assignments or locks', async ({
  page,
}) => {
  const f = await draftFixture()
  await login(page, f.admin.email, 'admin')
  await page.goto(`/admin/workshops/${f.session.id}`)
  let release: (() => void) | undefined
  let held = false
  await page.route(`**/admin/workshops/${f.session.id}**`, async (route) => {
    if (route.request().method() !== 'POST' || held) return route.continue()
    const response = await route.fetch()
    // A repeated identical submission uses the same deterministic command identity.
    await route.fetch()
    held = true
    await new Promise<void>((resolve) => {
      release = resolve
    })
    await route.fulfill({ response })
  })
  await page
    .getByRole('button', { name: 'Assign Fixture PA', exact: true })
    .click({ noWaitAfter: true })
  await expect.poll(() => held).toBe(true)
  await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled()
  expect(await prisma.assignment.count()).toBe(1)
  expect(await prisma.draftStaffingOperation.count()).toBe(1)
  release?.()
  await expect(page.getByRole('button', { name: 'Remove PA', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Remove PA', exact: true })).toBeVisible()
  expect(await prisma.assignment.count()).toBe(1)
  expect(
    await prisma.workshopSession.findUniqueOrThrow({ where: { id: f.session.id } })
  ).toMatchObject({ locked: false, scheduledStart: f.session.scheduledStart })
})

test('legacy selected-session links keep exact scope and archived proposals never mutate drafts', async ({
  page,
}) => {
  const f = await draftFixture()
  const enrollment = await addCandidateFixture(f.sibling.id, '2027-01-11')
  const second = await prisma.workshopSession.create({
    data: {
      classWorkshopId: enrollment.classWorkshopId,
      scheduledStart: vancouverToUtc('2027-01-11', 600),
      scheduledEnd: vancouverToUtc('2027-01-11', 660),
    },
  })
  const old = await prisma.matchingPreview.create({
    data: {
      actorId: f.admin.id,
      month: '2027-01',
      classIds: {
        kind: 'sessions',
        workshopDefinitionId: 'fixture-definition-1',
        workshopSessionIds: [f.session.id],
      },
      inputHash: 'old-format',
      plan: [
        { workshopSessionId: f.session.id, paIds: [f.pa.id], reasons: ['Historical warning.'] },
      ],
      expiresAt: new Date('2020-01-01T00:00:00Z'),
    },
  })
  await login(page, f.admin.email, 'admin')
  await page.goto(
    `/admin/workshops/match?workshopDefinitionId=fixture-definition-1&sessionId=${f.session.id}&sessionId=${second.id}&week=2027-01-04`
  )
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/admin/workshop-definitions/fixture-definition-1' &&
      url.searchParams.getAll('sessionId').length === 2 &&
      url.searchParams.get('week') === '2027-01-04'
  )
  await expect(page.getByRole('region', { name: 'Draft staffing' }).locator('article')).toHaveCount(
    2
  )
  await page.getByRole('link', { name: '3. Publish', exact: true }).click()
  expect(new URL(page.url()).searchParams.getAll('sessionId').sort()).toEqual(
    [f.session.id, second.id].sort()
  )
  await page.goto(
    `/admin/workshops/plan?workshopDefinitionId=fixture-definition-1&sessionId=${f.session.id}&sessionId=${second.id}`
  )
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get('step') === 'plan' && url.searchParams.getAll('sessionId').length === 2
  )
  await page.getByRole('link', { name: '2. Staff', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Draft staffing' }).locator('article')).toHaveCount(
    2
  )
  await page.goto('/admin/workshops/plan?workshopDefinitionId=fixture-definition-1&sessionId=')
  await expect(page).toHaveURL((url) => url.searchParams.get('sessionId') === 'unavailable')
  await page.getByRole('link', { name: '2. Staff', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Draft staffing' }).locator('article')).toHaveCount(
    0
  )
  await page.goto(`/admin/workshops/match/${old.id}?week=2027-01-04`)
  await expect(
    page.getByRole('heading', { name: 'Archived staffing proposal', exact: true })
  ).toBeVisible()
  await expect(page.getByText('Archived proposal:', { exact: true }).locator('..')).toContainText(
    'Fixture PA'
  )
  await expect(page.getByRole('button', { name: /apply|save|edit staffing|preview/i })).toHaveCount(
    0
  )
  const current = page.getByRole('link', { name: 'Open current draft: Workshop 1', exact: true })
  await expect(current).toHaveAttribute(
    'href',
    new RegExp(`step=staff&week=2027-01-04&sessionId=${f.session.id}$`)
  )
  expect(await prisma.assignment.count()).toBe(0)
  expect(await prisma.matchingPreview.findUniqueOrThrow({ where: { id: old.id } })).toEqual(old)
  await current.click()
  await expect(page.getByRole('region', { name: 'Draft staffing' }).locator('article')).toHaveCount(
    1
  )
  await expect(page.locator(`#session-${f.session.id}`)).toBeVisible()
  expect(await prisma.assignment.count()).toBe(0)
  await page.goto(
    '/admin/workshops/match?workshopDefinitionId=fixture-definition-1&scopeKind=month&month=invalid'
  )
  await expect(page).toHaveURL((url) => url.searchParams.get('sessionId') === 'unavailable')
  await expect(page.getByRole('region', { name: 'Draft staffing' }).locator('article')).toHaveCount(
    0
  )
  await prisma.matchingPreview.update({
    where: { id: old.id },
    data: {
      plan: [],
      classIds: {
        kind: 'sessions',
        workshopDefinitionId: 'fixture-definition-1',
        workshopSessionIds: ['removed-session'],
      },
    },
  })
  await page.goto(`/admin/workshops/match/${old.id}`)
  await page.getByRole('link', { name: 'Open current draft: Workshop 1', exact: true }).click()
  await expect(page).toHaveURL((url) => url.searchParams.get('sessionId') === 'unavailable')
  await expect(page.getByRole('region', { name: 'Draft staffing' }).locator('article')).toHaveCount(
    0
  )
  expect(await prisma.assignment.count()).toBe(0)
})
