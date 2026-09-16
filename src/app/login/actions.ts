'use server'

import { randomUUID } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { previewAuthSessionCookie } from '@/lib/auth-cookie'
import { prisma } from '@/lib/db'
import {
  getPreviewDemoConfig,
  isSameOriginPreviewRequest,
  PREVIEW_DEMO_SESSION_MAX_AGE_SECONDS,
  previewDemoEmailForRole,
} from '@/lib/preview-demo-auth'
import { previewDemoLoginSchema } from '@/lib/schemas/auth'

const previewDemoDestinations = {
  ADMIN: '/admin',
  TEACHER: '/teacher',
  PA: '/pa',
} as const

function denyPreviewDemoLogin(): never {
  redirect('/login?error=PreviewDemoUnavailable')
}

export async function previewDemoLogin(formData: FormData): Promise<never> {
  const config = getPreviewDemoConfig()
  if (!config) denyPreviewDemoLogin()

  const requestHeaders = await headers()
  if (!isSameOriginPreviewRequest(requestHeaders)) denyPreviewDemoLogin()

  const parsed = previewDemoLoginSchema.safeParse({
    role: formData instanceof FormData ? formData.get('role') : null,
  })
  if (!parsed.success) denyPreviewDemoLogin()

  const { role } = parsed.data
  const email = previewDemoEmailForRole(config, role)
  const user = await prisma.user.findFirst({
    where: { email, role, deletedAt: null },
    select: { id: true },
  })
  if (!user) denyPreviewDemoLogin()

  const expires = new Date(Date.now() + PREVIEW_DEMO_SESSION_MAX_AGE_SECONDS * 1000)
  const sessionToken = randomUUID()
  await prisma.session.create({
    data: { sessionToken, userId: user.id, expires },
  })

  const cookieStore = await cookies()
  cookieStore.set(previewAuthSessionCookie.name, sessionToken, {
    ...previewAuthSessionCookie.options,
    expires,
  })

  redirect(previewDemoDestinations[role])
}
