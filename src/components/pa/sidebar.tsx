'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Calendar, ClipboardCheck, Clock, LayoutGrid, LogOut } from 'lucide-react'

import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/pa', label: 'Assignments', icon: LayoutGrid },
  { href: '/pa/schedule', label: 'Schedule', icon: Calendar },
  { href: '/pa/checkin', label: 'Check-in', icon: ClipboardCheck },
  { href: '/pa/availability', label: 'Availability', icon: Clock },
] as const

export function PASidebar({ signOutAction }: { signOutAction: () => Promise<void> }) {
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
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === '/pa' ? pathname === '/pa' : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
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
