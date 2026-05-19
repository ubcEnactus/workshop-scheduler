// LOCATION IS MANDATED BY NEXT.JS 16 — DO NOT MOVE THIS FILE.
//
// In Next 16, `middleware.ts` was renamed to `proxy.ts` and must live at the
// project root or inside `src/` at the same level as `app/`. It cannot be
// nested in `lib/` or anywhere else. See:
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
//
// Purpose: optimistic auth check. Redirects unauthenticated users to /login
// before pages render. The authoritative role check still happens
// server-side in each protected page/action via `requireRole()` from
// `@/lib/auth`. Never trust this proxy alone for authorization.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PROTECTED_PREFIXES = ['/admin', '/teacher', '/pa']
const PUBLIC_PATHS = new Set(['/login', '/login/check-email', '/403'])

const SESSION_COOKIE_NAMES = ['authjs.session-token', '__Secure-authjs.session-token']

function hasSessionCookie(req: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((name) => Boolean(req.cookies.get(name)))
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next()

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  if (!isProtected) return NextResponse.next()

  if (!hasSessionCookie(req)) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  // Skip Next internals, the auth route handler, and static assets.
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
