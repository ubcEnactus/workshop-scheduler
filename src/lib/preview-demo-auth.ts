import type { Role } from '@prisma/client'
import { z } from 'zod'

const previewDemoEmailSchema = z.string().trim().toLowerCase().email()

export type PreviewDemoConfig = Readonly<{
  adminEmail: string
  teacherEmail: string
  paEmail: string
}>

/**
 * Preview demo access has several independent, fail-closed gates. The project
 * identity and account allowlist are server environment values configured only
 * on the dedicated Vercel preview project.
 */
export function getPreviewDemoConfig(
  env: NodeJS.ProcessEnv = process.env
): PreviewDemoConfig | null {
  const configuredProjectId = env.AUTH_PREVIEW_DEMO_PROJECT_ID
  if (
    env.VERCEL_ENV !== 'preview' ||
    env.AUTH_PREVIEW_DEMO_ENABLED !== 'true' ||
    !configuredProjectId ||
    env.VERCEL_PROJECT_ID !== configuredProjectId
  ) {
    return null
  }

  const values = [
    env.AUTH_PREVIEW_ADMIN_EMAIL,
    env.AUTH_PREVIEW_TEACHER_EMAIL,
    env.AUTH_PREVIEW_PA_EMAIL,
  ]
  const emails = values.map((value) => previewDemoEmailSchema.safeParse(value))

  if (emails.some((result) => !result.success)) return null

  const [adminResult, teacherResult, paResult] = emails
  if (!adminResult.success || !teacherResult.success || !paResult.success) return null

  const adminEmail = adminResult.data
  const teacherEmail = teacherResult.data
  const paEmail = paResult.data

  // Treat whitespace/case changes as configuration errors, rather than silently
  // expanding or transforming the allowlist.
  if (
    adminEmail !== values[0] ||
    teacherEmail !== values[1] ||
    paEmail !== values[2] ||
    new Set([adminEmail, teacherEmail, paEmail]).size !== 3
  ) {
    return null
  }

  return { adminEmail, teacherEmail, paEmail }
}

export function isPreviewDemoEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return getPreviewDemoConfig(env) !== null
}

export function previewDemoEmailForRole(config: PreviewDemoConfig, role: Role): string {
  if (role === 'ADMIN') return config.adminEmail
  if (role === 'TEACHER') return config.teacherEmail
  return config.paEmail
}

export function isSameOriginPreviewRequest(requestHeaders: Pick<Headers, 'get'>): boolean {
  const origin = requestHeaders.get('origin')
  const forwardedHost = requestHeaders.get('x-forwarded-host')?.split(',')[0]?.trim()
  const host = forwardedHost || requestHeaders.get('host')
  if (!origin || !host) return false

  try {
    const originUrl = new URL(origin)
    return (
      origin === originUrl.origin &&
      originUrl.protocol === 'https:' &&
      originUrl.host.toLowerCase() === host.trim().toLowerCase()
    )
  } catch {
    return false
  }
}

export const PREVIEW_DEMO_SESSION_MAX_AGE_SECONDS = 2 * 60 * 60
