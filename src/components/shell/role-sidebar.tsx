'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Calendar, LogOut } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
}

type RoleSidebarProps = {
  /** Nav links, owned by the role's own sidebar module. */
  items: readonly NavItem[]
  /** The role's index route (e.g. "/pa"). Matched exactly; others by prefix. */
  homeHref: string
  signOutAction: () => Promise<void>
}

/**
 * Shared sidebar chrome for the three role areas: brand block, nav list with
 * active-route highlighting, and sign-out. Roles supply their own `items`, so
 * navigation stays domain-owned while the chrome lives in one place.
 */
export function RoleSidebar({ items, homeHref, signOutAction }: RoleSidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="flex h-full w-60 flex-col bg-[#1e2a4a] text-white">
      <div className="flex items-center gap-2 px-5 py-6">
        <div className="flex size-9 items-center justify-center rounded-lg bg-white/10">
          <Calendar className="size-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight">Workshop</p>
          <p className="text-[10px] font-medium tracking-widest text-white/60 uppercase">
            Ennovate
          </p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {items.map((item) => {
          const isActive =
            item.href === homeHref ? pathname === homeHref : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-white/15 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="p-3">
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg bg-amber-500 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-600"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  )
}
