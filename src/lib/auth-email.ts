type EmailEnvironment = { nodeEnv?: string; apiKey?: string; from?: string }

type ResendVerificationRequest = {
  identifier: string
  url: string
  apiKey: string
  from: string
  fetcher?: typeof fetch
}

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

function senderAddress(from: string): string | null {
  const value = from.trim()
  const namedAddress = value.match(/^[^<>]*<([^<>]+)>$/)
  if ((value.includes('<') || value.includes('>')) && !namedAddress) return null
  const address = (namedAddress?.[1] ?? value).trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? address : null
}

export function emailDeliveryMode({
  nodeEnv,
  apiKey,
  from,
}: EmailEnvironment): 'console' | 'resend' {
  if (nodeEnv === 'production') {
    if (!apiKey?.trim()) throw new Error('AUTH_RESEND_KEY is required in production.')
    const address = from ? senderAddress(from) : null
    if (!address || /@example\.com$/i.test(address))
      throw new Error('AUTH_RESEND_FROM must use your verified sending domain in production.')
  }
  return apiKey?.trim() ? 'resend' : 'console'
}

export async function sendResendVerificationRequest({
  identifier,
  url,
  apiKey,
  from,
  fetcher = fetch,
}: ResendVerificationRequest): Promise<void> {
  const response = await fetcher('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: from.trim(),
      to: identifier,
      subject: 'Sign in to Workshop Scheduler',
      text: `Sign in by opening this link:\n\n${url}\n\nIf you didn't request this, you can ignore this email.`,
    }),
  })

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1_000)
    throw new Error(`Resend error: ${response.status} ${detail}`)
  }
}
