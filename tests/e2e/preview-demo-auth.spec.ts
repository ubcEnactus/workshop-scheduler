import { expect, test } from '@playwright/test'

import { prisma } from '../../src/lib/db'
import { PREVIEW_DEMO_SESSION_MAX_AGE_SECONDS } from '../../src/lib/preview-demo-auth'
import { resetFixtures } from '../fixtures'

const accounts = [
  {
    emailVariable: 'AUTH_PREVIEW_ADMIN_EMAIL',
    label: 'Continue as admin',
    role: 'ADMIN',
    destination: '/admin',
  },
  {
    emailVariable: 'AUTH_PREVIEW_TEACHER_EMAIL',
    label: 'Continue as teacher',
    role: 'TEACHER',
    destination: '/teacher',
  },
  {
    emailVariable: 'AUTH_PREVIEW_PA_EMAIL',
    label: 'Continue as PA',
    role: 'PA',
    destination: '/pa',
  },
] as const

const serverOrigin = new URL(process.env.AUTH_URL!).origin
const browserOrigin = serverOrigin.replace(/^http:/, 'https:')

test.beforeEach(async () => {
  await resetFixtures()
  await prisma.user.createMany({
    data: accounts.map(({ emailVariable, role }) => ({
      email: process.env[emailVariable]!,
      name: `Preview ${role}`,
      role,
    })),
  })
})

test.afterAll(async () => {
  await prisma.$disconnect()
})

test('preview demo buttons establish short real sessions for all three roles', async ({
  browser,
}) => {
  for (const { emailVariable, label, role, destination } of accounts) {
    const email = process.env[emailVariable]!
    const context = await browser.newContext()
    const page = await context.newPage()

    // Exercise the production HTTPS-only origin and Secure cookie contract while
    // retaining the dependency-free local HTTP dev server. Browser requests use
    // a genuine HTTPS origin; Playwright forwards each one to the HTTP listener.
    await page.route(`${browserOrigin}/**`, async (route) => {
      const serverUrl = new URL(route.request().url())
      serverUrl.protocol = 'http:'
      const response = await route.fetch({ url: serverUrl.toString(), maxRedirects: 0 })
      await route.fulfill({ response })
    })

    await page.goto(`${browserOrigin}/login`)
    await expect(page.getByRole('heading', { name: 'Preview demo access' })).toBeVisible()
    await expect
      .poll(() =>
        prisma.user.count({
          where: { email, role, deletedAt: null },
        })
      )
      .toBe(1)
    const startedAt = Date.now()
    await page.getByRole('button', { name: `${label} (${email})` }).click()
    await expect(page).toHaveURL(new RegExp(`${destination}$`))

    const cookie = (await context.cookies()).find(
      (candidate) => candidate.name === '__Secure-authjs.session-token'
    )
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', secure: true })

    // The virtual transport can leave the streamed Server Action redirect body
    // attached to its fulfilled response. Reload the fixed destination through
    // the HTTPS route to verify the issued cookie against a full page request.
    await page.goto(`${browserOrigin}${destination}`)
    await expect(page).toHaveURL(`${browserOrigin}${destination}`)
    await expect(page.getByRole('heading', { name: /Hello/ })).toBeVisible()

    const user = await prisma.user.findUniqueOrThrow({ where: { email } })
    const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } })
    expect(session.expires.getTime()).toBeGreaterThanOrEqual(
      startedAt + PREVIEW_DEMO_SESSION_MAX_AGE_SECONDS * 1000
    )
    expect(session.expires.getTime()).toBeLessThanOrEqual(
      Date.now() + PREVIEW_DEMO_SESSION_MAX_AGE_SECONDS * 1000
    )

    const expiresBeforeSessionRead = session.expires
    const sessionResult = await page.evaluate(async () => {
      const response = await fetch('/api/auth/session')
      return { status: response.status, body: await response.json() }
    })
    expect(sessionResult.status).toBe(200)
    expect(sessionResult.body).toMatchObject({ user: { email, role } })
    expect((await prisma.session.findUniqueOrThrow({ where: { id: session.id } })).expires).toEqual(
      expiresBeforeSessionRead
    )

    await context.close()
  }
})
