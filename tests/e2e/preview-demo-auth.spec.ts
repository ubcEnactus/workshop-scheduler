import { expect, test, type Browser, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'

import { prisma } from '../../src/lib/db'
import { PREVIEW_DEMO_SESSION_MAX_AGE_SECONDS } from '../../src/lib/preview-demo-auth'
import { resetFixtures } from '../fixtures'

const accounts = [
  {
    emailVariable: 'AUTH_PREVIEW_ADMIN_EMAIL',
    label: 'Continue as demo admin',
    role: 'ADMIN',
    destination: '/admin',
  },
  {
    emailVariable: 'AUTH_PREVIEW_TEACHER_EMAIL',
    label: 'Continue as demo teacher',
    role: 'TEACHER',
    destination: '/teacher',
  },
  {
    emailVariable: 'AUTH_PREVIEW_PA_EMAIL',
    label: 'Continue as demo PA',
    role: 'PA',
    destination: '/pa',
  },
] as const

const browserOrigin = new URL(process.env.AUTH_URL!).origin

async function previewBrowser(browser: Browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await context.newPage()
  return { context, page }
}

async function requestPreviewEmailLink(page: Page, email: string) {
  await page.goto(`${browserOrigin}/login`)
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByRole('button', { name: 'Send sign-in link' }).click()
  await expect(page).toHaveURL(`${browserOrigin}/login/check-email`)
  let link = ''
  await expect
    .poll(async () => {
      const lines = (await readFile(process.env.E2E_SERVER_LOG!, 'utf8')).split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === `to: ${email}`) {
          link = lines[i + 1]?.trim().replace(/^url: /, '') ?? ''
        }
      }
      return link
    })
    .toMatch(/^https:\/\/localhost:.*\/api\/auth\/callback\/resend/)
  return link
}

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

test('an admin-only preview hides absent, deleted and wrong-role demo accounts', async ({
  page,
}) => {
  await prisma.user.deleteMany({
    where: { email: process.env.AUTH_PREVIEW_PA_EMAIL! },
  })
  await prisma.user.update({
    where: { email: process.env.AUTH_PREVIEW_TEACHER_EMAIL! },
    data: { deletedAt: new Date() },
  })
  await page.goto('/login')
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send sign-in link' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Continue as demo admin' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue as demo teacher' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Continue as demo PA' })).toHaveCount(0)
  await expect(page.getByText(/uses test data|private preview/)).toHaveCount(0)
  await prisma.user.update({
    where: { email: process.env.AUTH_PREVIEW_TEACHER_EMAIL! },
    data: { deletedAt: null, role: 'PA' },
  })
  await page.reload()
  await expect(page.getByRole('button', { name: 'Continue as demo teacher' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Continue as demo PA' })).toHaveCount(0)
})

test('preview demo buttons establish short real sessions for all three roles', async ({
  browser,
}) => {
  for (const { emailVariable, label, role, destination } of accounts) {
    const email = process.env[emailVariable]!
    const { context, page } = await previewBrowser(browser)

    await page.goto(`${browserOrigin}/login`)
    await expect(page.getByRole('heading', { name: 'Try a demo account' })).toBeVisible()
    await expect
      .poll(() =>
        prisma.user.count({
          where: { email, role, deletedAt: null },
        })
      )
      .toBe(1)
    const startedAt = Date.now()
    await page.getByRole('button', { name: label }).click()
    await expect(page).toHaveURL(new RegExp(`${destination}$`))

    const cookie = (await context.cookies()).find(
      (candidate) => candidate.name === '__Secure-authjs.session-token'
    )
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', secure: true })

    // A fresh full-page request must authenticate with the issued Secure cookie.
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

test('invited admins, PAs and teachers can use one-time email links alongside demo access', async ({
  browser,
}) => {
  for (const [email, destination] of [
    ['admin@fixture.local', '/admin'],
    ['pa@fixture.local', '/pa'],
    ['teacher@fixture.local', '/teacher'],
  ] as const) {
    const { context, page } = await previewBrowser(browser)
    const link = await requestPreviewEmailLink(page, email)
    await page.goto(link)
    await page.goto(`${browserOrigin}${destination}`)
    await expect(page).toHaveURL(`${browserOrigin}${destination}`)
    await expect(page.getByRole('heading', { name: /Hello/ })).toBeVisible()
    const cookie = (await context.cookies()).find(
      (candidate) => candidate.name === '__Secure-authjs.session-token'
    )
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', secure: true })
    await context.close()

    const replay = await previewBrowser(browser)
    await replay.page.goto(link)
    await replay.page.goto(`${browserOrigin}${destination}`)
    await expect(replay.page).toHaveURL(`${browserOrigin}/login`)
    await replay.context.close()
  }
})

test('email access rejects unknown or deleted accounts while demo buttons remain available', async ({
  browser,
}) => {
  const { context, page } = await previewBrowser(browser)
  for (const email of ['unknown@fixture.local', 'deleted@fixture.local']) {
    await page.goto(`${browserOrigin}/login`)
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByRole('button', { name: 'Send sign-in link' }).click()
    await expect(page).toHaveURL(`${browserOrigin}/login?error=AccessDenied`)
    expect(await prisma.verificationToken.count({ where: { identifier: email } })).toBe(0)
    await expect(page.getByRole('button', { name: 'Continue as demo PA' })).toBeVisible()
  }
  await context.close()
})

test('combined account and demo sign-in is accessible on desktop and mobile', async ({ page }) => {
  for (const viewport of [
    { width: 1365, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/login')
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue as demo PA' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  }
})
