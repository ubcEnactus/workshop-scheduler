import type { ReactNode } from 'react'

type RoleShellProps = {
  /** Display name/email for the welcome line and avatar initials. */
  displayName: string
  /** Short role caption under the name, e.g. "Admin". */
  roleLabel: string
  /** Tailwind background for the avatar circle — the one per-role accent. */
  avatarClassName: string
  /** The role's sidebar element. */
  sidebar: ReactNode
  children: ReactNode
}

/**
 * Shared app shell for the three role areas: sidebar column, top bar with the
 * welcome line and avatar, and the scrolling content region.
 *
 * Auth stays with each role's layout (AGENTS.md: `requireRole`/`getCurrentUser`
 * is the first line of every protected page) — this component is presentation
 * only and never reads the session itself.
 */
export function RoleShell({
  displayName,
  roleLabel,
  avatarClassName,
  sidebar,
  children,
}: RoleShellProps) {
  const initials = displayName.slice(0, 2).toUpperCase()

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {sidebar}

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6">
          <p className="text-sm text-gray-600">
            Welcome back, <span className="font-semibold text-gray-900">{displayName}</span>
          </p>
          <div className="flex items-center gap-3">
            <div
              className={`flex size-8 items-center justify-center rounded-full text-xs font-bold text-white ${avatarClassName}`}
            >
              {initials}
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-gray-900">{displayName}</p>
              <p className="text-[10px] text-gray-500 uppercase">{roleLabel}</p>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
