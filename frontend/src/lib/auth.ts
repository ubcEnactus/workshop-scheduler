import NextAuth, { type DefaultSession } from 'next-auth'
import Resend from 'next-auth/providers/resend'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { redirect } from 'next/navigation'
import type { Role } from '@/generated/prisma/client'

import { prisma } from '@/lib/db'

// Augment the NextAuth Session so `session.user.role` and `schoolId` are typed.
declare module 'next-auth' {
  interface User {
    role?: Role
    schoolId?: string | null
  }

  interface Session {
    user: {
      id: string
      role: Role
      schoolId: string | null
    } & DefaultSession['user']
  }
}

const hasResendKey = Boolean(process.env.AUTH_RESEND_KEY)

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'database' },
  pages: {
    signIn: '/login',
    verifyRequest: '/login/check-email',
  },
  providers: [
    Resend({
      from: process.env.AUTH_RESEND_FROM ?? 'no-reply@example.com',
      apiKey: process.env.AUTH_RESEND_KEY ?? 'dev-no-key',
      // Dev escape hatch: if no Resend key, log the magic link to the server
      // console instead of trying to send email. Lets the team log in locally
      // without setting up Resend.
      async sendVerificationRequest({ identifier, url, provider }) {
        if (!hasResendKey) {
          console.log('\n──────────────────────────────────────────────')
          console.log('  Magic link (dev mode — no AUTH_RESEND_KEY set)')
          console.log(`  to: ${identifier}`)
          console.log(`  url: ${url}`)
          console.log('──────────────────────────────────────────────\n')
          return
        }

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: provider.from,
            to: identifier,
            subject: 'Sign in to Workshop Scheduler',
            text: `Sign in by opening this link:\n\n${url}\n\nIf you didn't request this, you can ignore this email.`,
          }),
        })

        if (!res.ok) {
          const body = await res.text()
          throw new Error(`Resend error: ${res.status} ${body}`)
        }
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      // Prisma adapter passes the DB user. Project role + schoolId onto the
      // session so server components and actions can read them synchronously.
      session.user.id = user.id
      session.user.role = (user as { role?: Role }).role ?? 'PA'
      session.user.schoolId = (user as { schoolId?: string | null }).schoolId ?? null
      return session
    },
  },
})

// ---------------------------------------------------------------------------
// Authorization helpers
//
// Use `requireRole(...)` at the top of every protected page and Server Action.
// `getCurrentUser()` is the read-only equivalent for conditional UI.
// ---------------------------------------------------------------------------

export type SessionUser = {
  id: string
  email: string
  name: string | null
  role: Role
  schoolId: string | null
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth()
  if (!session?.user) return null
  return {
    id: session.user.id,
    email: session.user.email ?? '',
    name: session.user.name ?? null,
    role: session.user.role,
    schoolId: session.user.schoolId,
  }
}

/**
 * Redirects to /login if there's no session.
 * Redirects to /403 if the session role isn't in the allowed list.
 * Otherwise returns the current user.
 *
 * Call this on the first line of every protected page and Server Action.
 */
export async function requireRole(allowed: Role | Role[]): Promise<SessionUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const allowedRoles = Array.isArray(allowed) ? allowed : [allowed]
  if (!allowedRoles.includes(user.role)) redirect('/403')

  return user
}
