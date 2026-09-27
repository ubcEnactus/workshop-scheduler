import { createSessionFixture } from '../fixtures'
import { test, expect } from '@playwright/test'
import { prisma } from '../../src/lib/db'
import { resetFixtures } from '../fixtures'
import { vancouverToUtc } from '../../src/lib/time'
import { login } from './helpers'

test.afterAll(async () => {
  await prisma.$disconnect()
})

for (const fromWorkshop of [false, true])
  test(`published change review preserves ${fromWorkshop ? 'workshop calendar' : 'master schedule'} context`, async ({
    page,
  }) => {
    const fixture = await resetFixtures()
    const workshop = await createSessionFixture({
      data: {
        classSectionId: fixture.cls.id,
        scheduledStart: vancouverToUtc('2027-01-04', 600),
        scheduledEnd: vancouverToUtc('2027-01-04', 660),
        minPAs: 1,
        maxPAs: 1,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        locked: true,
      },
    })
    const context = new URLSearchParams({
      month: '2027-01',
      schoolId: fixture.school.id,
      classSectionId: fixture.cls.id,
      view: 'published',
    })
    if (fromWorkshop) context.set('from', 'workshop')
    const { workshopDefinitionId } = await prisma.classWorkshop.findUniqueOrThrow({
      where: { id: workshop.classWorkshopId },
      select: { workshopDefinitionId: true },
    })

    await login(page, fixture.admin.email, 'admin')
    await page.goto(`/admin/workshops/${workshop.id}?${context}`)

    const cancellation = page.locator('form').filter({
      has: page.locator('input[name="kind"][value="CANCEL"]'),
    })
    await page.getByText('Cancel workshop', { exact: true }).click()
    await cancellation.getByLabel('Reason').fill('School closure')
    await cancellation.getByRole('button', { name: 'Review cancellation' }).click()
    await expect(page).toHaveURL(
      (url) =>
        /^\/admin\/workshops\/changes\/[^/]+$/.test(url.pathname) &&
        [...context].every(([key, value]) => url.searchParams.get(key) === value)
    )
    await expect(
      page.getByRole('heading', { name: 'Review workshop change', exact: true })
    ).toBeVisible()

    await page.getByRole('link', { name: 'Back to workshop' }).click()
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === `/admin/workshops/${workshop.id}` &&
        [...context].every(([key, value]) => url.searchParams.get(key) === value)
    )
    await page.goBack()
    await expect(page).toHaveURL((url) => /^\/admin\/workshops\/changes\/[^/]+$/.test(url.pathname))
    await expect(
      page.getByRole('heading', { name: 'Review workshop change', exact: true })
    ).toBeVisible()
    await page.getByRole('button', { name: 'Apply workshop change' }).click()
    await expect(page).toHaveURL(
      (url) =>
        [...context].every(([key, value]) => url.searchParams.get(key) === value) &&
        url.searchParams.get('changed') === '1'
    )

    const returnLink = page.getByRole('link', {
      name: '← Back to Fixture workshop schedule',
      exact: true,
    })
    const returnHref = await returnLink.getAttribute('href')
    expect(returnHref).not.toBeNull()
    const returnUrl = new URL(returnHref!, page.url())
    if (fromWorkshop) {
      expect(returnUrl.pathname).toBe('/admin/workshop-definitions/' + workshopDefinitionId)
      expect(returnUrl.searchParams.get('view')).toBe('overview')
      expect(returnUrl.searchParams.get('month')).toBe('2027-01')
      await returnLink.click()
      await expect(page.getByRole('region', { name: 'Workshop session calendar' })).toBeVisible()
    } else {
      expect(returnUrl.pathname).toBe('/admin/workshops')
      expect(returnUrl.searchParams.get('workshopDefinitionId')).toBe(workshopDefinitionId)
      for (const [key, value] of context) expect(returnUrl.searchParams.get(key)).toBe(value)
      await returnLink.click()
      await expect(page).toHaveURL(
        (url) =>
          url.pathname === '/admin/workshops' &&
          url.searchParams.get('workshopDefinitionId') === workshopDefinitionId &&
          [...context].every(([key, value]) => url.searchParams.get(key) === value)
      )
    }
  })
