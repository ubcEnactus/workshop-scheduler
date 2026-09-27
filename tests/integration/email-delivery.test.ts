import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest'
import { prisma } from '../../src/lib/db'
import { resetFixtures } from '../fixtures'
import { emailSignInSucceeded } from '../../src/lib/auth-email'

import { Auth, raw, skipCSRFCheck } from '@auth/core'
import Resend from '@auth/core/providers/resend'
import { PrismaAdapter } from '@auth/prisma-adapter'

let deliveryReady: Promise<void>

async function requestSignIn(email: string) {
  let releaseDelivery = () => {}
  deliveryReady = new Promise<void>((resolve) => {
    releaseDelivery = resolve
  })
  const adapter = PrismaAdapter(prisma)
  const response = await Auth(
    new Request('http://localhost/api/auth/signin/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email, callbackUrl: 'http://localhost/' }),
    }),
    {
      raw,
      skipCSRFCheck,
      trustHost: true,
      secret: 'isolated-email-test-secret',
      basePath: '/api/auth',
      adapter: {
        ...adapter,
        createVerificationToken: (data) => {
          releaseDelivery()
          return adapter.createVerificationToken!(data)
        },
      },
      providers: [Resend({ apiKey: 'test-provider-key', from: 'Workshop <signin@example.test>' })],
      logger: { error: vi.fn() },
    }
  )
  return response instanceof Response ? response.headers.get('Location') : response.redirect
}

let fixtures: Awaited<ReturnType<typeof resetFixtures>>
beforeEach(async () => {
  fixtures = await resetFixtures()
  vi.stubEnv('AUTH_RESEND_KEY', 'test-provider-key')
  vi.stubEnv('AUTH_RESEND_FROM', 'Workshop <signin@example.test>')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
afterAll(() => prisma.$disconnect())

it.each([401, 403, 429, 500])(
  'does not report a sent email when Resend returns %s',
  async (status) => {
    const send = vi.fn(async () => {
      await deliveryReady
      return Response.json({ message: 'Provider rejected this request' }, { status })
    })
    vi.stubGlobal('fetch', send)
    const result: unknown = await requestSignIn(fixtures.admin.email)
    expect(send).toHaveBeenCalledOnce()
    expect(emailSignInSucceeded(result)).toBe(false)
    expect(await prisma.session.count()).toBe(0)
  }
)

it('reports success only after the provider accepts the sign-in email', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ id: 'accepted-test-email' }))
  )
  const result: unknown = await requestSignIn(fixtures.admin.email)
  expect(emailSignInSucceeded(result)).toBe(true)
  expect(await prisma.session.count()).toBe(0)
})
