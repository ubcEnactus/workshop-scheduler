import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { prisma } from '../../src/lib/db'
import { PREVIEW_DEMO_SESSION_MAX_AGE_SECONDS } from '../../src/lib/preview-demo-auth'
import { form, resetFixtures } from '../fixtures'

const { cookieSet, requestHeaders } = vi.hoisted(() => ({
  cookieSet: vi.fn(),
  requestHeaders: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ set: cookieSet })),
  headers: requestHeaders,
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

import { previewDemoLogin } from '../../src/app/login/actions'

const previewEnvironmentNames = [
  'VERCEL_ENV',
  'VERCEL_PROJECT_ID',
  'AUTH_PREVIEW_DEMO_ENABLED',
  'AUTH_PREVIEW_DEMO_PROJECT_ID',
  'AUTH_PREVIEW_ADMIN_EMAIL',
  'AUTH_PREVIEW_TEACHER_EMAIL',
  'AUTH_PREVIEW_PA_EMAIL',
] as const

const originalPreviewEnvironment = Object.fromEntries(
  previewEnvironmentNames.map((name) => [name, process.env[name]])
)

let fixtures: Awaited<ReturnType<typeof resetFixtures>>

function enablePreviewDemo() {
  Object.assign(process.env, {
    VERCEL_ENV: 'preview',
    VERCEL_PROJECT_ID: 'prj_preview_integration',
    AUTH_PREVIEW_DEMO_ENABLED: 'true',
    AUTH_PREVIEW_DEMO_PROJECT_ID: 'prj_preview_integration',
    AUTH_PREVIEW_ADMIN_EMAIL: fixtures.admin.email,
    AUTH_PREVIEW_TEACHER_EMAIL: fixtures.teacher.email,
    AUTH_PREVIEW_PA_EMAIL: fixtures.pa.email,
  })
}

beforeEach(async () => {
  fixtures = await resetFixtures()
  enablePreviewDemo()
  requestHeaders.mockResolvedValue(
    new Headers({
      host: 'preview.example.test',
      origin: 'https://preview.example.test',
    })
  )
  cookieSet.mockReset()
})

afterEach(() => {
  for (const name of previewEnvironmentNames) {
    const original = originalPreviewEnvironment[name]
    if (original === undefined) delete process.env[name]
    else process.env[name] = original
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('preview demo Server Action authorization', () => {
  it.each([
    ['the feature flag is disabled', { AUTH_PREVIEW_DEMO_ENABLED: 'false' }],
    ['the deployment is not a preview', { VERCEL_ENV: 'production' }],
    ['the Vercel project differs', { VERCEL_PROJECT_ID: 'prj_unapproved' }],
  ])('rejects a direct action call when %s', async (_case, overrides) => {
    Object.assign(process.env, overrides)

    await expect(previewDemoLogin(form({ role: 'ADMIN' }))).rejects.toThrow(
      'REDIRECT:/login?error=PreviewDemoUnavailable'
    )
    expect(await prisma.session.count()).toBe(0)
    expect(cookieSet).not.toHaveBeenCalled()
  })

  it('rejects malformed roles and cross-origin direct calls', async () => {
    await expect(previewDemoLogin(form({ role: 'OWNER' }))).rejects.toThrow(
      'REDIRECT:/login?error=PreviewDemoUnavailable'
    )
    requestHeaders.mockResolvedValue(
      new Headers({
        host: 'preview.example.test',
        origin: 'https://attacker.example.test',
      })
    )
    await expect(previewDemoLogin(form({ role: 'PA' }))).rejects.toThrow(
      'REDIRECT:/login?error=PreviewDemoUnavailable'
    )
    expect(await prisma.session.count()).toBe(0)
    expect(cookieSet).not.toHaveBeenCalled()
  })

  it('rejects an allowlisted email whose current database role does not match', async () => {
    await prisma.user.update({
      where: { id: fixtures.admin.id },
      data: { role: 'PA' },
    })

    await expect(previewDemoLogin(form({ role: 'ADMIN' }))).rejects.toThrow(
      'REDIRECT:/login?error=PreviewDemoUnavailable'
    )
    expect(await prisma.session.count()).toBe(0)
    expect(cookieSet).not.toHaveBeenCalled()
  })

  it('rejects an allowlisted account after it is soft-deleted', async () => {
    await prisma.user.update({
      where: { id: fixtures.pa.id },
      data: { deletedAt: new Date() },
    })

    await expect(previewDemoLogin(form({ role: 'PA' }))).rejects.toThrow(
      'REDIRECT:/login?error=PreviewDemoUnavailable'
    )
    expect(await prisma.session.count()).toBe(0)
    expect(cookieSet).not.toHaveBeenCalled()
  })

  it('creates a short secure database session and fixed redirect for every role', async () => {
    const startedAt = Date.now()

    for (const [role, user, destination] of [
      ['ADMIN', fixtures.admin, '/admin'],
      ['TEACHER', fixtures.teacher, '/teacher'],
      ['PA', fixtures.pa, '/pa'],
    ] as const) {
      await expect(previewDemoLogin(form({ role }))).rejects.toThrow(`REDIRECT:${destination}`)

      const session = await prisma.session.findFirstOrThrow({
        where: { userId: user.id },
        orderBy: { expires: 'desc' },
      })
      const expectedLatestExpiry = Date.now() + PREVIEW_DEMO_SESSION_MAX_AGE_SECONDS * 1000
      expect(session.expires.getTime()).toBeGreaterThanOrEqual(
        startedAt + PREVIEW_DEMO_SESSION_MAX_AGE_SECONDS * 1000
      )
      expect(session.expires.getTime()).toBeLessThanOrEqual(expectedLatestExpiry)
      expect(cookieSet).toHaveBeenLastCalledWith(
        '__Secure-authjs.session-token',
        session.sessionToken,
        {
          expires: session.expires,
          httpOnly: true,
          path: '/',
          sameSite: 'lax',
          secure: true,
        }
      )
    }

    expect(await prisma.session.count()).toBe(3)
    expect(
      new Set((await prisma.session.findMany()).map((session) => session.sessionToken)).size
    ).toBe(3)
  })
})
