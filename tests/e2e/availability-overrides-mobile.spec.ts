import { expect, test, type Locator } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { prisma } from '../../src/lib/db'
import { vancouverToUtc } from '../../src/lib/time'
import { createSessionFixture, resetFixtures } from '../fixtures'
import { login } from './helpers'

test.afterAll(() => prisma.$disconnect())

for (const surface of ['drawer', 'detail', 'staff'] as const) {
  test(`${surface} availability warnings and enabled actions stay accessible at 390px`, async ({
    page,
  }) => {
    const f = await resetFixtures()
    const partial = await prisma.user.create({
      data: { name: 'Partial PA', email: 'partial-mobile@fixture.local', role: 'PA' },
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
    await page.setViewportSize({ width: 390, height: 844 })
    await login(page, f.admin.email, 'admin')
    let scope: Locator
    if (surface === 'drawer') {
      await page.goto('/admin/workshops?month=2027-01')
      await page.getByRole('button', { name: 'Staff Fixture Biology', exact: true }).click()
      scope = page.getByRole('dialog', { name: 'Staff Fixture Biology', exact: true })
    } else if (surface === 'detail') {
      await page.goto(`/admin/workshops/${session.id}`)
      scope = page.getByRole('main')
    } else {
      const definitionId = (
        await prisma.classWorkshop.findUniqueOrThrow({ where: { id: session.classWorkshopId } })
      ).workshopDefinitionId
      await page.goto(`/admin/workshops/match?workshopDefinitionId=${definitionId}`)
      scope = page.locator(`#session-${session.id}`)
      await scope.getByText('Add PA', { exact: true }).click()
    }
    if (surface !== 'staff') {
      await expect(scope.getByRole('heading', { name: 'Other PAs', exact: true })).toBeVisible()
    }
    await expect(scope.getByText('Availability is missing.', { exact: false })).toBeVisible()
    await expect(
      scope.getByText('Availability does not cover the full workshop.', { exact: false })
    ).toBeVisible()
    const firstAction = scope.getByRole('button', {
      name: 'Assign Fixture PA',
      exact: true,
    })
    const secondAction = scope.getByRole('button', {
      name: 'Assign Partial PA',
      exact: true,
    })
    await expect(firstAction).toBeEnabled()
    await expect(secondAction).toBeEnabled()
    await expect(scope.getByRole('checkbox', { name: /availability/i })).toHaveCount(0)
    await expect(scope.getByRole('textbox', { name: 'Override reason', exact: true })).toHaveCount(
      0
    )
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(await scope.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    const audit = new AxeBuilder({ page })
    if (surface === 'drawer') audit.include('dialog[open]')
    expect((await audit.analyze()).violations).toEqual([])
    const screenshotTarget =
      surface === 'detail'
        ? scope.getByRole('heading', { name: 'Other PAs', exact: true }).locator('..')
        : scope
    await screenshotTarget.screenshot({
      path: `work/availability-overrides-${surface}-mobile.png`,
    })
    if (surface === 'staff') {
      await secondAction.scrollIntoViewIfNeeded()
      await expect(secondAction).toBeInViewport()
      await expect(
        scope.getByText('Availability does not cover the full workshop.', { exact: false })
      ).toBeInViewport()
      await scope.screenshot({ path: 'work/availability-overrides-staff-mobile-candidates.png' })
    }
    await firstAction.click()
    await expect(
      scope.getByText('Availability is missing.', { exact: false }).first()
    ).toBeVisible()
    await expect(secondAction).toBeEnabled()
    await expect(scope.getByRole('textbox', { name: 'Override reason', exact: true })).toHaveCount(
      0
    )
    if (surface === 'staff') await expect(scope.getByText('1 assigned · 2 required')).toBeVisible()
    await expect
      .poll(() =>
        prisma.assignment.findUnique({
          where: { workshopSessionId_paId: { workshopSessionId: session.id, paId: f.pa.id } },
        })
      )
      .toMatchObject({ overrideAvailability: true, source: 'MANUAL' })
  })
}
