import { expect, test } from '@playwright/test'
import { prisma } from '../../src/lib/db'
import { resetFixtures } from '../fixtures'
import { login } from './helpers'

test.afterAll(() => prisma.$disconnect())

test('shows immediate feedback while sidebar and query navigation wait for RSC', async ({
  page,
}) => {
  const fixture = await resetFixtures()
  await login(page, fixture.admin.email, 'admin')

  const dashboard = page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Overview', exact: true })
  const dashboardHref = await dashboard.getAttribute('href')
  expect(dashboardHref).toBeTruthy()
  await page.goto(dashboardHref!)
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Overview', exact: true })
    .click()
  await expect(page.getByRole('status').filter({ hasText: /^Loading Overview/ })).toHaveCount(0)
  await expect(page.locator('#main-content')).toHaveAttribute('aria-busy', 'false')

  let releaseSidebar = () => {}
  const sidebarGate = new Promise<void>((resolve) => {
    releaseSidebar = resolve
  })
  let sidebarHeld = false
  await page.route('**/admin/workshops?**', async (route) => {
    const request = route.request()
    if (
      !sidebarHeld &&
      request.method() === 'GET' &&
      request.headers().rsc &&
      !request.headers()['next-router-prefetch']
    ) {
      sidebarHeld = true
      await sidebarGate
    }
    await route.continue()
  })

  try {
    const sidebarNavigation = page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Calendar', exact: true })
      .click()
    await expect.poll(() => sidebarHeld).toBe(true)
    const sidebarStatus = page.getByRole('status').filter({ hasText: 'Loading Calendar…' })
    await expect(sidebarStatus).toBeVisible()
    await expect(page.locator('#main-content')).toHaveAttribute('aria-busy', 'true')
    await expect(page.getByRole('heading', { name: /Hello Fixture Admin/ })).toBeVisible()

    releaseSidebar()
    await sidebarNavigation
    await expect(page).toHaveURL(/\/admin\/workshops\?month=/)
    await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible()
    await expect(sidebarStatus).toHaveCount(0)
    await expect(page.locator('#main-content')).toHaveAttribute('aria-busy', 'false')
  } finally {
    releaseSidebar()
    await page.unrouteAll({ behavior: 'wait' })
  }

  let releaseView = () => {}
  const viewGate = new Promise<void>((resolve) => {
    releaseView = resolve
  })
  let viewHeld = false
  await page.route('**/admin/workshops?**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (
      !viewHeld &&
      request.method() === 'GET' &&
      request.headers().rsc &&
      !request.headers()['next-router-prefetch'] &&
      url.searchParams.get('view') === 'published'
    ) {
      viewHeld = true
      await viewGate
    }
    await route.continue()
  })

  try {
    const published = page.getByRole('link', { name: /^Published ·/ })
    const viewNavigation = published.click()
    await expect.poll(() => viewHeld).toBe(true)
    const viewStatus = page.getByRole('status').filter({ hasText: 'Loading Published' })
    await expect(viewStatus).toBeVisible()
    await expect(page.locator('#main-content')).toHaveAttribute('aria-busy', 'true')
    await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible()

    releaseView()
    await viewNavigation
    await expect(page).toHaveURL((url) => url.searchParams.get('view') === 'published')
    await expect(published).toHaveAttribute('aria-current', 'page')
    await expect(viewStatus).toHaveCount(0)
    await expect(page.locator('#main-content')).toHaveAttribute('aria-busy', 'false')
  } finally {
    releaseView()
    await page.unrouteAll({ behavior: 'wait' })
  }
})
