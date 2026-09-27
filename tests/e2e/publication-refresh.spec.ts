import { createSessionFixture } from '../fixtures'
import { test, expect } from '@playwright/test'
import { prisma } from '../../src/lib/db'
import { resetFixtures } from '../fixtures'
import { vancouverToUtc } from '../../src/lib/time'
import { login } from './helpers'

test.afterAll(async () => {
  await prisma.$disconnect()
})

test('publication never exposes stale draft actions while the workspace refresh is delayed', async ({
  page,
}) => {
  const fixture = await resetFixtures()
  await prisma.schedulingSettings.update({
    where: { id: 1 },
    data: { minimumGapDays: 1 },
  })
  await prisma.monthlyPAQuota.create({
    data: { paId: fixture.pa.id, month: '2027-01', quota: 1 },
  })
  await prisma.availability.createMany({
    data: [600, 615, 630, 645].map((startMin) => ({
      userId: fixture.pa.id,
      dayOfWeek: 0,
      startMin,
    })),
  })
  const workshop = await createSessionFixture({
    data: {
      classSectionId: fixture.cls.id,
      scheduledStart: vancouverToUtc('2027-01-04', 600),
      scheduledEnd: vancouverToUtc('2027-01-04', 660),
      minPAs: 1,
      maxPAs: 1,
      assignments: {
        create: { paId: fixture.pa.id, status: 'DRAFT', source: 'MANUAL' },
      },
    },
  })

  await login(page, fixture.admin.email, 'admin')
  await page.goto('/admin/workshops?month=2027-01')

  let releaseRefresh = () => {}
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve
  })
  let delayRefresh = false
  let heldRefresh = false
  await page.route('**/admin/workshops?**', async (route) => {
    const request = route.request()
    if (delayRefresh && request.method() === 'GET' && request.headers().rsc) {
      delayRefresh = false
      heldRefresh = true
      await refreshGate
    }
    await route.continue()
  })

  try {
    await page.getByRole('checkbox', { name: /Select Fixture Biology .* for publication/ }).check()
    await page.getByRole('button', { name: 'Review publication (1)' }).click()
    delayRefresh = true
    await page.getByRole('button', { name: 'Publish selected teacher sessions' }).click()
    await expect.poll(() => heldRefresh).toBe(true)

    await expect(page.getByText(/^1 teacher session published\./)).toBeVisible()
    await expect(page.getByText('published', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Staff Fixture Biology' })).toHaveCount(0)
    await expect(
      page.getByRole('checkbox', { name: /Select Fixture Biology .* for publication/ })
    ).toHaveCount(0)
    expect(
      await prisma.workshopSession.findUniqueOrThrow({ where: { id: workshop.id } })
    ).toMatchObject({
      status: 'PUBLISHED',
    })
  } finally {
    releaseRefresh()
    await page.unrouteAll({ behavior: 'wait' })
  }
})
