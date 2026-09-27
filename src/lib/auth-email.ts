type EmailEnvironment = { nodeEnv?: string; apiKey?: string; from?: string }

// Auth.js can return an error redirect instead of throwing when a provider fails.
// Only the verification-request redirect confirms that the send was accepted.
export function emailSignInSucceeded(result: unknown): boolean {
  if (typeof result !== 'string') return false
  try {
    const url = new URL(result, 'https://auth.invalid')
    return (
      url.pathname === '/api/auth/verify-request' &&
      url.searchParams.get('provider') === 'resend' &&
      url.searchParams.get('type') === 'email' &&
      !url.searchParams.has('error')
    )
  } catch {
    return false
  }
}

export function isEmailSignInReady(environment: EmailEnvironment): boolean {
  try {
    emailDeliveryMode(environment)
    return true
  } catch {
    return false
  }
}

export function emailDeliveryMode({
  nodeEnv,
  apiKey,
  from,
}: EmailEnvironment): 'console' | 'resend' {
  if (nodeEnv === 'production') {
    if (!apiKey?.trim()) throw new Error('AUTH_RESEND_KEY is required in production.')
    if (!from?.trim() || /@example\.com>?$/i.test(from.trim()))
      throw new Error('AUTH_RESEND_FROM must use your verified sending domain in production.')
  }
  return apiKey?.trim() ? 'resend' : 'console'
}
