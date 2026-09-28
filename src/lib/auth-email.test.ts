import { describe, expect, it } from 'vitest'
import {
  emailDeliveryMode,
  emailSignInSucceeded,
  isEmailSignInReady,
  sendResendVerificationRequest,
} from './auth-email'

describe('email sign-in result', () => {
  it('accepts only the successful provider verification redirect', () => {
    expect(
      emailSignInSucceeded('https://app.example/api/auth/verify-request?provider=resend&type=email')
    ).toBe(true)
    expect(emailSignInSucceeded('/api/auth/verify-request?provider=resend&type=email')).toBe(true)
  })
  it.each([
    'https://app.example/api/auth/error?error=Configuration',
    '/login?error=AccessDenied',
    '/api/auth/verify-request?provider=resend&type=email&error=Configuration',
    '/api/auth/signin/resend',
    '/api/auth/verify-request?provider=resend',
    undefined,
    null,
    {},
  ])('does not claim an email was sent after an error or unexpected result: %s', (result) => {
    expect(emailSignInSucceeded(result)).toBe(false)
  })
})
describe('email delivery configuration', () => {
  it('permits local console delivery without credentials', () => {
    expect(emailDeliveryMode({ nodeEnv: 'development' })).toBe('console')
  })
  it('fails closed without a production key', () => {
    expect(() =>
      emailDeliveryMode({ nodeEnv: 'production', from: 'Club <team@school.test>' })
    ).toThrow('AUTH_RESEND_KEY')
  })
  it('fails closed for missing or placeholder production senders', () => {
    for (const from of [
      undefined,
      '',
      '  ',
      'not-an-address',
      'Club <broken-address>',
      'Club <no-reply@example.com>',
    ]) {
      expect(() =>
        emailDeliveryMode({ nodeEnv: 'production', apiKey: 'configured', from })
      ).toThrow('AUTH_RESEND_FROM')
    }
  })
  it('selects real delivery only with production credentials and a configured sender', () => {
    expect(
      emailDeliveryMode({
        nodeEnv: 'production',
        apiKey: 'configured',
        from: 'Club <team@school.test>',
      })
    ).toBe('resend')
  })
  it('keeps hosted email sign-in unavailable until a key and sender are configured', () => {
    expect(isEmailSignInReady({ nodeEnv: 'production' })).toBe(false)
    expect(isEmailSignInReady({ nodeEnv: 'production', apiKey: 'configured' })).toBe(false)
    expect(
      isEmailSignInReady({
        nodeEnv: 'production',
        apiKey: 'configured',
        from: 'Club <no-reply@example.com>',
      })
    ).toBe(false)
    expect(
      isEmailSignInReady({
        nodeEnv: 'production',
        apiKey: 'configured',
        from: 'Club <team@school.test>',
      })
    ).toBe(true)
    expect(isEmailSignInReady({ nodeEnv: 'development' })).toBe(true)
  })
})

describe('Resend verification requests', () => {
  it('trims configured credentials and submits the expected sign-in message', async () => {
    const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
      expect(input).toBe('https://api.resend.com/emails')
      expect(init?.headers).toEqual({
        Authorization: 'Bearer re_test',
        'Content-Type': 'application/json',
      })
      expect(JSON.parse(String(init?.body))).toEqual({
        from: 'Workshop <signin@school.test>',
        to: 'admin@example.test',
        subject: 'Sign in to Workshop Scheduler',
        text: "Sign in by opening this link:\n\nhttps://app.test/link\n\nIf you didn't request this, you can ignore this email.",
      })
      return Response.json({ id: 'accepted' })
    }

    await expect(
      sendResendVerificationRequest({
        identifier: 'admin@example.test',
        url: 'https://app.test/link',
        apiKey: ' re_test ',
        from: ' Workshop <signin@school.test> ',
        fetcher,
      })
    ).resolves.toBeUndefined()
  })

  it('surfaces the provider status when Resend rejects delivery', async () => {
    await expect(
      sendResendVerificationRequest({
        identifier: 'admin@example.test',
        url: 'https://app.test/link',
        apiKey: 're_invalid',
        from: 'Workshop <signin@school.test>',
        fetcher: async () => Response.json({ message: 'Invalid API key' }, { status: 401 }),
      })
    ).rejects.toThrow('Resend error: 401')
  })
})
