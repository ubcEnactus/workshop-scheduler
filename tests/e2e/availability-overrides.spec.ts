import { expect, test, type Locator } from '@playwright/test'
import { prisma } from '../../src/lib/db'
import { vancouverToUtc } from '../../src/lib/time'
import { createSessionFixture, resetFixtures } from '../fixtures'
import { login } from './helpers'

test.afterAll(() => prisma.$disconnect())

const missingWarning = 'Availability is missing.'
const partialWarning = 'Availability does not cover the full workshop.'

async function expectNoAvailabilityConfirmation(scope: Locator) {
  await expect(scope.getByRole('checkbox', { name: /availability/i })).toHaveCount(0)
  await expect(scope.getByRole('textbox', { name: 'Override reason', exact: true })).toHaveCount(0)
}

for (const surface of ['calendar drawer', 'session detail'] as const) {
  for (const coverage of ['missing', 'partial'] as const) {
    test(`${surface}: ${coverage} availability warns but one click assigns and permits publication`, async ({
      page,
    }) => {
      const f = await resetFixtures()
      if (coverage === 'partial') {
        await prisma.availability.create({
          data: { userId: f.pa.id, dayOfWeek: 0, startMin: 600 },
        })
      }
      const session = await createSessionFixture({
        data: {
          classSectionId: f.cls.id,
          scheduledStart: vancouverToUtc('2027-01-04', 600),
          scheduledEnd: vancouverToUtc('2027-01-04', 660),
          minPAs: 1,
          maxPAs: 1,
        },
      })
      await login(page, f.admin.email, 'admin')
      let scope: Locator
      if (surface === 'calendar drawer') {
        await page.goto('/admin/workshops?month=2027-01')
        await page.getByRole('button', { name: 'Staff Fixture Biology', exact: true }).click()
        scope = page.getByRole('dialog', { name: 'Staff Fixture Biology', exact: true })
      } else {
        await page.goto(`/admin/workshops/${session.id}`)
        scope = page.getByRole('main')
      }
      const warning = coverage === 'missing' ? missingWarning : partialWarning
      await expect(scope.getByText(warning, { exact: false }).first()).toBeVisible()
      await expectNoAvailabilityConfirmation(scope)
      const assign = scope.getByRole('button', { name: 'Assign Fixture PA', exact: true })
      await expect(assign).toBeEnabled()
      await assign.click()
      await expect
        .poll(() =>
          prisma.assignment.findUnique({
            where: { workshopSessionId_paId: { workshopSessionId: session.id, paId: f.pa.id } },
          })
        )
        .toMatchObject({
          source: 'MANUAL',
          status: 'DRAFT',
          overrideAvailability: true,
          overrideSameDay: false,
          overrideWeek: false,
          overrideReason: null,
        })
      await expect(scope.getByText(warning, { exact: false }).first()).toBeVisible()
      await expectNoAvailabilityConfirmation(scope)
      if (surface === 'calendar drawer') {
        await scope.getByRole('button', { name: 'Close', exact: true }).click()
        await page
          .getByRole('checkbox', { name: /Select Fixture Biology .* for publication/ })
          .check()
        await page.getByRole('button', { name: 'Review publication (1)' }).click()
        const publish = page.getByRole('button', { name: 'Publish selected teacher sessions' })
        await expect(publish).toBeEnabled()
        await publish.click()
        await expect(page.getByText(/^1 teacher session published\./)).toBeVisible()
      } else {
        const publish = page.getByRole('button', { name: 'Publish session', exact: true })
        await expect(publish).toBeEnabled()
        await publish.click()
        await expect(page).toHaveURL(/published=1/)
      }
      expect(
        await prisma.workshopSession.findUniqueOrThrow({
          where: { id: session.id },
          include: { assignments: true },
        })
      ).toMatchObject({
        status: 'PUBLISHED',
        assignments: [{ paId: f.pa.id, status: 'PUBLISHED', overrideAvailability: true }],
      })
    })
  }
}

test('saved draft keeps availability warnings visible through immediate edits, reload and publication', async ({
  page,
}) => {
  const f = await resetFixtures()
  const partial = await prisma.user.create({
    data: { name: 'Partial PA', email: 'partial@fixture.local', role: 'PA' },
  })
  await prisma.availability.create({
    data: { userId: partial.id, dayOfWeek: 0, startMin: 600 },
  })
  const session = await createSessionFixture({
    data: {
      classSectionId: f.cls.id,
      scheduledStart: vancouverToUtc('2027-01-04', 600),
      scheduledEnd: vancouverToUtc('2027-01-04', 660),
      minPAs: 2,
      maxPAs: 2,
    },
  })
  const definitionId = (
    await prisma.classWorkshop.findUniqueOrThrow({ where: { id: session.classWorkshopId } })
  ).workshopDefinitionId
  await login(page, f.admin.email, 'admin')
  await page.goto(`/admin/workshops/match?workshopDefinitionId=${definitionId}`)
  await expect(page).toHaveURL(
    new RegExp(`/admin/workshop-definitions/${definitionId}\\?step=staff`)
  )
  const draft = page.locator(`#session-${session.id}`)
  await expect(draft.getByText('0 assigned · 2 required')).toBeVisible()
  await page.getByRole('button', { name: 'Auto-fill missing PAs (1)', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'No PAs added.' })).toBeVisible()
  expect(await prisma.assignment.count({ where: { workshopSessionId: session.id } })).toBe(0)
  await draft.getByText('Add PA', { exact: true }).click()
  await expect(draft.getByText(missingWarning, { exact: false })).toBeVisible()
  await expect(draft.getByText(partialWarning, { exact: false })).toBeVisible()
  await expectNoAvailabilityConfirmation(draft)
  const missingAdd = draft.getByRole('button', { name: 'Assign Fixture PA', exact: true })
  await expect(missingAdd).toBeEnabled()
  await missingAdd.focus()
  await page.keyboard.press('Enter')
  await expect(draft.getByText('1 assigned · 2 required')).toBeVisible()
  expect(await prisma.assignment.count({ where: { workshopSessionId: session.id } })).toBe(1)
  await expect(draft.getByText(missingWarning, { exact: false })).toBeVisible()
  await draft.getByRole('button', { name: 'Assign Partial PA', exact: true }).click()
  await expect(draft.getByText('2 assigned · 2 required')).toBeVisible()
  await expect(draft.getByText(partialWarning, { exact: false })).toBeVisible()
  await expectNoAvailabilityConfirmation(draft)
  await draft.getByRole('button', { name: 'Remove Partial PA' }).click()
  await expect(draft.getByText('1 assigned · 2 required')).toBeVisible()
  await expect(draft.getByText('Excluded from auto-fill for this session.')).toBeVisible()
  await draft.getByRole('button', { name: 'Assign Partial PA', exact: true }).click()
  await expect(draft.getByText('2 assigned · 2 required')).toBeVisible()
  const assignments = await prisma.assignment.findMany({
    where: { workshopSessionId: session.id },
  })
  expect(assignments).toHaveLength(2)
  expect(assignments.map((assignment) => assignment.paId).sort()).toEqual(
    [f.pa.id, partial.id].sort()
  )
  for (const assignment of assignments) {
    expect(assignment).toMatchObject({
      source: 'MANUAL',
      overrideAvailability: true,
      overrideReason: null,
    })
  }
  await page.goto(`/admin/workshops/match?workshopDefinitionId=${definitionId}`)
  await expect(draft.getByText('2 assigned · 2 required')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Auto-fill missing PAs (0)', exact: true })
  ).toBeDisabled()
  expect(
    await prisma.workshopSession.findUniqueOrThrow({ where: { id: session.id } })
  ).toMatchObject({ locked: false })
  expect(await prisma.assignment.findMany({ where: { workshopSessionId: session.id } })).toEqual(
    assignments
  )
  await page
    .getByRole('navigation', { name: 'Workshop workflow' })
    .getByRole('link', { name: '3. Publish', exact: true })
    .click()
  await expect(page.getByText(missingWarning, { exact: false }).first()).toBeVisible()
  await expect(page.getByText(partialWarning, { exact: false }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Select all ready', exact: true }).click()
  await page.getByRole('button', { name: 'Publish 1 session', exact: true }).click()
  await expect(page.getByText(/^1 teacher session published\./)).toBeVisible()
  expect(
    await prisma.assignment.count({
      where: { workshopSessionId: session.id, overrideAvailability: true, status: 'PUBLISHED' },
    })
  ).toBe(2)
})

for (const kind of ['combined edit', 'replacement'] as const) {
  test(`published ${kind}: availability warning does not add an extra confirmation or block applying`, async ({
    page,
  }) => {
    const f = await resetFixtures()
    const replacement = await prisma.user.create({
      data: { name: 'New PA', email: 'new-pa@fixture.local', role: 'PA' },
    })
    await prisma.availability.createMany({
      data: [600, 615, 630, 645].map((startMin) => ({
        userId: f.pa.id,
        dayOfWeek: 0,
        startMin,
      })),
    })
    if (kind === 'replacement') {
      await prisma.availability.create({
        data: { userId: replacement.id, dayOfWeek: 0, startMin: 600 },
      })
    }
    const session = await createSessionFixture({
      data: {
        classSectionId: f.cls.id,
        scheduledStart: vancouverToUtc('2027-01-04', 600),
        scheduledEnd: vancouverToUtc('2027-01-04', 660),
        minPAs: 1,
        maxPAs: 1,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        assignments: { create: { paId: f.pa.id, status: 'PUBLISHED' } },
      },
    })
    await login(page, f.admin.email, 'admin')
    await page.goto(`/admin/workshops/${session.id}`)
    if (kind === 'combined edit') {
      const edit = page.locator('#edit-session')
      await edit.locator('summary').click()
      await edit.getByRole('checkbox', { name: 'Fixture PA', exact: true }).uncheck()
      await edit.getByRole('checkbox', { name: 'New PA', exact: true }).check()
      await edit.getByLabel('Reason', { exact: true }).fill('Admin selected the updated PA team.')
      await edit.getByRole('button', { name: 'Review full change' }).click()
    } else {
      await page.getByText('Replace a PA', { exact: true }).click()
      await page
        .getByRole('combobox', { name: 'Replacement PA', exact: true })
        .selectOption(replacement.id)
      await page.locator('#REPLACE-reason').fill('Admin selected a replacement PA.')
      await page.getByRole('button', { name: 'Review replacement' }).click()
    }
    await expect(page.getByRole('heading', { name: 'Review workshop change' })).toBeVisible()
    const warning = kind === 'combined edit' ? missingWarning : partialWarning
    await expect(page.getByText(warning, { exact: false }).first()).toBeVisible()
    await expectNoAvailabilityConfirmation(page.getByRole('main'))
    expect(
      await prisma.assignment.findFirstOrThrow({ where: { workshopSessionId: session.id } })
    ).toMatchObject({ paId: f.pa.id, overrideAvailability: false })
    const apply = page.getByRole('button', { name: 'Apply workshop change' })
    await expect(apply).toBeEnabled()
    await apply.click()
    await expect(page).toHaveURL(/changed=1/)
    expect(
      await prisma.assignment.findMany({ where: { workshopSessionId: session.id } })
    ).toMatchObject([
      {
        paId: replacement.id,
        status: 'PUBLISHED',
        source: 'MANUAL',
        overrideAvailability: true,
        overrideSameDay: false,
        overrideWeek: false,
      },
    ])
    await expect(page.getByText(warning, { exact: false }).first()).toBeVisible()
  })
}

test('an availability warning never makes an overlapping PA assignable in manual screens', async ({
  page,
}) => {
  const f = await resetFixtures()
  const session = await createSessionFixture({
    data: {
      classSectionId: f.cls.id,
      scheduledStart: vancouverToUtc('2027-01-04', 600),
      scheduledEnd: vancouverToUtc('2027-01-04', 660),
      minPAs: 1,
      maxPAs: 1,
    },
  })
  await createSessionFixture({
    data: {
      classSectionId: f.sibling.id,
      scheduledStart: vancouverToUtc('2027-01-04', 630),
      scheduledEnd: vancouverToUtc('2027-01-04', 690),
      status: 'PUBLISHED',
      publishedAt: new Date(),
      assignments: { create: { paId: f.pa.id, status: 'PUBLISHED' } },
    },
  })
  const definitionId = (
    await prisma.classWorkshop.findUniqueOrThrow({ where: { id: session.classWorkshopId } })
  ).workshopDefinitionId
  await login(page, f.admin.email, 'admin')
  await page.goto(`/admin/workshops/${session.id}`)
  await page.getByText('Blocked PAs (1)', { exact: true }).click()
  await expect(page.getByText(/Conflicting assignment\./)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Assign Fixture PA', exact: true })).toHaveCount(0)
  await page.goto('/admin/workshops?month=2027-01')
  await page.getByRole('button', { name: 'Staff Fixture Biology', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Staff Fixture Biology', exact: true })
  await drawer.getByText('Blocked PAs (1)', { exact: true }).click()
  await expect(drawer.getByText(/Conflicting assignment\./)).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Assign Fixture PA', exact: true })).toHaveCount(
    0
  )
  await drawer.getByRole('button', { name: 'Close', exact: true }).click()
  await page.goto(`/admin/workshops/match?workshopDefinitionId=${definitionId}`)
  const editor = page.locator(`#session-${session.id}`)
  await editor.getByText('Add PA', { exact: true }).click()
  await editor.getByText('Blocked PAs (1)', { exact: true }).click()
  await expect(editor.getByText(/Conflicting assignment\./)).toBeVisible()
  await expect(editor.getByRole('button', { name: 'Assign Fixture PA', exact: true })).toHaveCount(
    0
  )
  expect(await prisma.assignment.count({ where: { workshopSessionId: session.id } })).toBe(0)
})
