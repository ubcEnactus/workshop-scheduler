import { test, expect } from '@playwright/test'
import { prisma } from '../../src/lib/db'
import { resetFixtures } from '../fixtures'
import { vancouverToUtc } from '../../src/lib/time'
import { login } from './helpers'

test.afterAll(async () => {
  await prisma.$disconnect()
})

test('published change review and apply preserve the originating schedule context', async ({
  page,
}) => {
  const fixture = await resetFixtures()
  const workshop = await prisma.workshop.create({
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

  await login(page, fixture.admin.email, 'admin')
  await page.goto(`/admin/workshops/${workshop.id}?${context}`)

  const cancellation = page.locator('form').filter({
    has: page.locator('input[name="kind"][value="CANCEL"]'),
  })
  await page.getByText('Cancel workshop', { exact: true }).click()
  await cancellation.getByLabel('Reason').fill('School closure')
  await cancellation.getByRole('button', { name: 'Review cancellation' }).click()
  await expect(page).toHaveURL((url) =>
    [...context].every(([key, value]) => url.searchParams.get(key) === value)
  )

  await page.getByRole('link', { name: 'Back to workshop' }).click()
  await expect(page).toHaveURL((url) =>
    [...context].every(([key, value]) => url.searchParams.get(key) === value)
  )
  await page.goBack()
  await page.getByRole('button', { name: 'Apply workshop change' }).click()
  await expect(page).toHaveURL(
    (url) =>
      [...context].every(([key, value]) => url.searchParams.get(key) === value) &&
      url.searchParams.get('changed') === '1'
  )

  await page.getByRole('link', { name: 'Back to 2027-01' }).click()
  await expect(page).toHaveURL((url) =>
    [...context].every(([key, value]) => url.searchParams.get(key) === value)
  )
})
