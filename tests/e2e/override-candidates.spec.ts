import { expect, test, type Locator, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { prisma } from '../../src/lib/db'
import { vancouverToUtc } from '../../src/lib/time'
import { createSessionFixture, resetFixtures } from '../fixtures'
import { login } from './helpers'

test.afterAll(() => prisma.$disconnect())

const weeklyWarning = 'Already assigned another session in this Monday–Friday week.'
const sameDayWarning = 'Already assigned another session on this day.'

async function overrideFixture() {
  const fixture = await resetFixtures()
  const [weeklyPA, sameDayPA] = await Promise.all([
    prisma.user.create({
      data: { role: 'PA', name: 'Weekly Override PA', email: 'weekly-override@fixture.local' },
    }),
    prisma.user.create({
      data: { role: 'PA', name: 'Same Day Override PA', email: 'same-day-override@fixture.local' },
    }),
  ])
  await prisma.availability.createMany({
    data: [
      ...[600, 615, 630, 645].flatMap((startMin) => [
        { userId: weeklyPA.id, dayOfWeek: 0, startMin },
        { userId: weeklyPA.id, dayOfWeek: 1, startMin },
        { userId: sameDayPA.id, dayOfWeek: 0, startMin },
      ]),
      ...[720, 735, 750, 765].map((startMin) => ({ userId: sameDayPA.id, dayOfWeek: 0, startMin })),
    ],
  })
  const target = await createSessionFixture({
    data: {
      classSectionId: fixture.cls.id,
      scheduledStart: vancouverToUtc('2027-01-04', 600),
      scheduledEnd: vancouverToUtc('2027-01-04', 660),
      minPAs: 1,
      maxPAs: 2,
    },
  })
  const weeklyCommitment = await createSessionFixture({
    data: {
      classSectionId: fixture.cls.id,
      scheduledStart: vancouverToUtc('2027-01-05', 600),
      scheduledEnd: vancouverToUtc('2027-01-05', 660),
      minPAs: 1,
      maxPAs: 2,
    },
  })
  const sameDayCommitment = await createSessionFixture({
    data: {
      classSectionId: fixture.sibling.id,
      scheduledStart: vancouverToUtc('2027-01-04', 720),
      scheduledEnd: vancouverToUtc('2027-01-04', 780),
      minPAs: 1,
      maxPAs: 2,
    },
  })
  await prisma.assignment.createMany({
    data: [
      { workshopSessionId: weeklyCommitment.id, paId: weeklyPA.id, source: 'MANUAL' },
      { workshopSessionId: sameDayCommitment.id, paId: sameDayPA.id, source: 'MANUAL' },
    ],
  })
  const definitionId = (
    await prisma.classWorkshop.findUniqueOrThrow({ where: { id: target.classWorkshopId } })
  ).workshopDefinitionId
  return { ...fixture, target, weeklyPA, sameDayPA, definitionId }
}

async function openTargetStaffing(page: Page, workshopSessionId: string) {
  await page.goto('/admin/workshops?month=2027-01')
  const targetRow = page.getByRole('row').filter({
    has: page.locator(`a[href^="/admin/workshops/${workshopSessionId}"]`),
  })
  await targetRow.getByRole('button', { name: 'Staff Fixture Biology', exact: true }).click()
  return page.getByRole('dialog', { name: 'Staff Fixture Biology', exact: true })
}

async function expectNoOverrideForm(scope: Locator) {
  await expect(scope.getByRole('textbox', { name: 'Override reason', exact: true })).toHaveCount(0)
  await expect(scope.getByRole('checkbox', { name: /override/i })).toHaveCount(0)
  await expect(
    scope.getByRole('button', { name: /Confirm assignment|Assign with override/i })
  ).toHaveCount(0)
  await expect(scope.getByRole('tooltip')).toHaveCount(0)
}

for (const surface of ['drawer', 'detail'] as const) {
  test(`${surface} assigns weekly and same-day candidates directly from visible warnings`, async ({
    page,
  }) => {
    const f = await overrideFixture()
    if (surface === 'detail') {
      await prisma.availability.deleteMany({ where: { userId: f.sameDayPA.id } })
    }
    await login(page, f.admin.email, 'admin')
    let scope: Locator
    if (surface === 'drawer') scope = await openTargetStaffing(page, f.target.id)
    else {
      await page.goto(`/admin/workshops/${f.target.id}`)
      scope = page.getByRole('main')
    }
    const weekly = scope.getByRole('group', { name: 'Weekly Override PA', exact: true })
    const sameDay = scope.getByRole('group', { name: 'Same Day Override PA', exact: true })
    await expect(weekly.getByText(weeklyWarning, { exact: false })).toBeVisible()
    await expect(sameDay.getByText(sameDayWarning, { exact: false })).toBeVisible()
    await expect(sameDay.getByText(weeklyWarning, { exact: false })).toBeVisible()
    if (surface === 'detail') {
      await expect(sameDay.getByText('Availability is missing.', { exact: false })).toBeVisible()
    }
    await expect(weekly).toHaveClass(/bg-amber-50/)
    await expect(sameDay).toHaveClass(/bg-red-50/)
    await expectNoOverrideForm(scope)
    const weeklyAssign = weekly.getByRole('button', {
      name: 'Assign Weekly Override PA',
      exact: true,
    })
    const sameDayAssign = sameDay.getByRole('button', {
      name: 'Assign Same Day Override PA',
      exact: true,
    })
    await expect(weeklyAssign).toBeEnabled()
    await expect(sameDayAssign).toBeEnabled()
    await weekly.getByText('Scheduled commitments', { exact: true }).click()
    await expect(weekly.getByText(/minutes between sessions/)).toBeVisible()
    await weekly.getByText('Scheduled commitments', { exact: true }).click()
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(await scope.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    const audit = new AxeBuilder({ page })
    if (surface === 'drawer') audit.include('dialog[open]')
    expect((await audit.analyze()).violations).toEqual([])
    await sameDay.screenshot({ path: `work/workload-warning-${surface}-mobile.png` })
    await weeklyAssign.focus()
    await page.keyboard.press('Enter')
    await expect
      .poll(() =>
        prisma.assignment.findUnique({
          where: {
            workshopSessionId_paId: { workshopSessionId: f.target.id, paId: f.weeklyPA.id },
          },
        })
      )
      .toMatchObject({
        overrideSameDay: false,
        overrideWeek: true,
        overrideReason: null,
        source: 'MANUAL',
      })
    // The write can finish before the detail page receives its refreshed version.
    await expect(weekly).toHaveCount(0)
    await expectNoOverrideForm(scope)
    await sameDayAssign.click()
    await expect
      .poll(() =>
        prisma.assignment.findUnique({
          where: {
            workshopSessionId_paId: { workshopSessionId: f.target.id, paId: f.sameDayPA.id },
          },
        })
      )
      .toMatchObject({
        overrideSameDay: true,
        overrideWeek: true,
        overrideAvailability: surface === 'detail',
        overrideReason: null,
        source: 'MANUAL',
      })
    await expect(sameDay).toHaveCount(0)
    await expectNoOverrideForm(scope)
    const saved = await prisma.assignment.findMany({
      where: { workshopSessionId: f.target.id },
      orderBy: { paId: 'asc' },
    })
    expect(saved).toHaveLength(2)
    await page.goto(`/admin/workshops/match?workshopDefinitionId=${f.definitionId}`)
    await expect(page).toHaveURL(
      new RegExp(`/admin/workshop-definitions/${f.definitionId}\\?step=staff`)
    )
    const savedDraft = page.locator(`#session-${f.target.id}`)
    await expect(savedDraft.getByText('2 assigned · 1 required')).toBeVisible()
    await expect(savedDraft.getByText(sameDayWarning, { exact: false })).toBeVisible()
    await expect(savedDraft.getByText(weeklyWarning, { exact: false }).first()).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Auto-fill missing PAs (0)', exact: true })
    ).toBeDisabled()
    expect(
      await prisma.workshopSession.findUniqueOrThrow({ where: { id: f.target.id } })
    ).toMatchObject({ locked: false })
    expect(
      await prisma.assignment.findMany({
        where: { workshopSessionId: f.target.id },
        orderBy: { paId: 'asc' },
      })
    ).toEqual(saved)
    await page.goto(`/admin/workshops/${f.target.id}`)
    await page.getByRole('button', { name: 'Publish session', exact: true }).click()
    await expect(page).toHaveURL(/published=1/)
    expect(
      await prisma.assignment.count({
        where: { workshopSessionId: f.target.id, status: 'PUBLISHED', overrideWeek: true },
      })
    ).toBe(2)
  })
}

for (const kind of ['combined edit', 'replacement'] as const) {
  test(`published ${kind} applies workload warnings without extra confirmations`, async ({
    page,
  }) => {
    const f = await overrideFixture()
    await prisma.workshopSession.update({
      where: { id: f.target.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        assignments: {
          create: {
            paId: f.pa.id,
            status: 'PUBLISHED',
            source: 'MANUAL',
            overrideAvailability: true,
          },
        },
      },
    })
    await login(page, f.admin.email, 'admin')
    await page.goto(`/admin/workshops/${f.target.id}`)
    if (kind === 'combined edit') {
      const edit = page.locator('#edit-session')
      await edit.locator('summary').click()
      await edit.getByRole('checkbox', { name: 'Fixture PA', exact: true }).uncheck()
      await edit.getByRole('checkbox', { name: 'Weekly Override PA', exact: true }).check()
      await edit.getByRole('checkbox', { name: 'Same Day Override PA', exact: true }).check()
      await edit.getByLabel('Reason', { exact: true }).fill('Admin updated the assigned team.')
      await edit.getByRole('button', { name: 'Review full change' }).click()
    } else {
      await page.getByText('Replace a PA', { exact: true }).click()
      await page
        .getByRole('combobox', { name: 'Replacement PA', exact: true })
        .selectOption(f.sameDayPA.id)
      await page.locator('#REPLACE-reason').fill('Admin selected replacement staff.')
      await page.getByRole('button', { name: 'Review replacement' }).click()
    }
    await expect(page.getByRole('heading', { name: 'Review workshop change' })).toBeVisible()
    await expect(page.getByText(sameDayWarning, { exact: false }).first()).toBeVisible()
    await expect(page.getByText(weeklyWarning, { exact: false }).first()).toBeVisible()
    await expectNoOverrideForm(page.getByRole('main'))
    await expect(page.getByRole('checkbox')).toHaveCount(0)
    const apply = page.getByRole('button', { name: 'Apply workshop change' })
    await expect(apply).toBeEnabled()
    await apply.click()
    await expect(page).toHaveURL(/changed=1/)
    const assignments = await prisma.assignment.findMany({
      where: { workshopSessionId: f.target.id },
    })
    expect(assignments).toHaveLength(kind === 'combined edit' ? 2 : 1)
    expect(assignments.find((assignment) => assignment.paId === f.sameDayPA.id)).toMatchObject({
      status: 'PUBLISHED',
      source: 'MANUAL',
      overrideSameDay: true,
      overrideWeek: true,
    })
    if (kind === 'combined edit') {
      expect(assignments.find((assignment) => assignment.paId === f.weeklyPA.id)).toMatchObject({
        status: 'PUBLISHED',
        source: 'MANUAL',
        overrideSameDay: false,
        overrideWeek: true,
      })
    }
  })
}
