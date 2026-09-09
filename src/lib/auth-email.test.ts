import { describe, expect, it } from 'vitest'
import { emailDeliveryMode } from './auth-email'
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
    for (const from of [undefined, '', '  ', 'Club <no-reply@example.com>']) {
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
})
