type EmailEnvironment = { nodeEnv?: string; apiKey?: string; from?: string }
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
