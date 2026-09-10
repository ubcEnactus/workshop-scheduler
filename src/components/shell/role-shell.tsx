'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  CalendarDays,
  LayoutDashboard,
  School,
  Users,
  BookOpen,
  UserRound,
  Settings2,
  CalendarPlus,
  Sparkles,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Clock3,
} from 'lucide-react'

type Role = 'ADMIN' | 'PA' | 'TEACHER'
const navigation = {
  ADMIN: [
    { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, group: 'Overview' },
    { href: '/admin/workshops', label: 'Workshops', icon: CalendarDays, group: 'Scheduling' },
    {
      href: '/admin/workshops/plan',
      label: 'Plan a month',
      icon: CalendarPlus,
      group: 'Scheduling',
    },
    { href: '/admin/workshops/match', label: 'Assign PAs', icon: Sparkles, group: 'Scheduling' },
    { href: '/admin/staffing', label: 'Quotas & settings', icon: Settings2, group: 'Scheduling' },
    { href: '/admin/schools', label: 'Schools', icon: School, group: 'People & places' },
    { href: '/admin/teachers', label: 'Teachers', icon: Users, group: 'People & places' },
    { href: '/admin/pas', label: 'Program assistants', icon: UserRound, group: 'People & places' },
    { href: '/admin/classes', label: 'Classes', icon: BookOpen, group: 'People & places' },
  ],
  PA: [
    { href: '/pa', label: 'My workshops', icon: CalendarDays, group: 'My workspace' },
    { href: '/pa/availability', label: 'My availability', icon: Clock3, group: 'My workspace' },
  ],
  TEACHER: [
    { href: '/teacher', label: 'School workshops', icon: CalendarDays, group: 'My workspace' },
  ],
}
const roleLabels = { ADMIN: 'Administrator', PA: 'Program assistant', TEACHER: 'Teacher' }
export function RoleShell({
  role,
  displayName,
  signOutAction,
  children,
}: {
  role: Role
  displayName: string
  signOutAction: () => Promise<void>
  children: ReactNode
}) {
  const pathname = usePathname()
  const dialog = useRef<HTMLDialogElement>(null)
  const menuButton = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)')
    const closeOnDesktop = () => {
      if (desktop.matches) dialog.current?.close()
    }
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [])
  const items = navigation[role]
  const active =
    items
      .filter(
        (item) =>
          pathname === item.href ||
          (item.href !== items[0].href && pathname.startsWith(item.href + '/'))
      )
      .sort((a, b) => b.href.length - a.href.length)[0] ?? items[0]
  const initials = displayName
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  function closeMenu() {
    dialog.current?.close()
  }
  const sidebar = (mobile = false) => (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center gap-3 px-6 py-7">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-amber-300"
        >
          <CalendarDays className="size-5" />
        </span>
        <div>
          <p className="text-lg leading-none font-bold tracking-tight">
            Workshop<span className="text-amber-300">.</span>
          </p>
          <p className="mt-1.5 text-[10px] font-medium tracking-[0.2em] text-slate-300 uppercase">
            Ennovate
          </p>
        </div>
        {mobile && (
          <button
            type="button"
            aria-label="Close navigation"
            className="ml-auto flex size-9 items-center justify-center rounded-lg text-white hover:bg-white/10"
            onClick={closeMenu}
          >
            <X className="size-5" />
          </button>
        )}
      </div>
      <nav
        aria-label={mobile ? 'Mobile navigation' : 'Main navigation'}
        className="flex-1 space-y-6 px-3 pb-6"
      >
        {[...new Set(items.map((item) => item.group))].map((group) => (
          <div key={group}>
            <p className="px-3 pb-2 text-[10px] font-semibold tracking-[0.13em] text-slate-300 uppercase">
              {group}
            </p>
            <ul className="space-y-1">
              {items
                .filter((item) => item.group === group)
                .map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={mobile ? closeMenu : undefined}
                      aria-current={active.href === item.href ? 'page' : undefined}
                      className={
                        'flex min-h-10 items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ' +
                        (active.href === item.href
                          ? 'bg-white/15 text-white shadow-[inset_3px_0_0_#fbbf24]'
                          : 'text-slate-300 hover:bg-white/10 hover:text-white')
                      }
                    >
                      <item.icon aria-hidden="true" className="size-[18px] shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="mx-5 mb-5 rounded-lg border border-white/10 bg-white/5 p-3">
        <p className="text-xs font-medium text-white">More impact, together.</p>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
          Connecting volunteers and schools through meaningful workshops.
        </p>
      </div>
      <div className="border-t border-white/10 p-4">
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-amber-400 px-3 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-500"
          >
            <LogOut aria-hidden="true" className="size-4" />
            Sign out
          </button>
        </form>
      </div>
    </div>
  )
  return (
    <div className="app-shell min-h-screen bg-[#f5f6f9] text-slate-900">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 overflow-y-auto bg-[#1e2a4a] text-white lg:block">
        {sidebar()}
      </aside>
      <div className="min-w-0 lg:pl-60">
        <header className="flex min-h-18 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              ref={menuButton}
              type="button"
              aria-label="Open navigation"
              aria-haspopup="dialog"
              aria-expanded={open}
              onClick={() => {
                dialog.current?.showModal()
                setOpen(true)
              }}
              className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-700 lg:hidden"
            >
              <Menu aria-hidden="true" className="size-5" />
            </button>
            <p className="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
              Workspace <ChevronRight aria-hidden="true" className="size-3" />
              <span className="font-medium text-slate-700">{active.label}</span>
            </p>
            <p className="text-sm font-semibold sm:hidden">
              Workshop<span className="text-amber-600">.</span>
            </p>
          </div>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <span
              aria-hidden="true"
              className={
                'flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ' +
                (role === 'PA'
                  ? 'bg-amber-100 text-amber-900'
                  : role === 'TEACHER'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-[#1e2a4a] text-white')
              }
            >
              {initials}
            </span>
            <div className="min-w-0">
              <p
                className="max-w-36 truncate text-xs font-semibold text-slate-800 sm:max-w-60"
                title={displayName}
              >
                {displayName}
              </p>
              <p className="text-[10px] leading-relaxed text-slate-500">{roleLabels[role]}</p>
            </div>
          </div>
        </header>
        <div id="main-content" tabIndex={-1} className="min-w-0 outline-none">
          {children}
        </div>
        <footer className="mx-auto flex max-w-[1480px] flex-wrap justify-between gap-2 px-4 pb-6 text-[11px] text-slate-500 sm:px-8">
          <span>Ennovate · Workshop coordination</span>
          <span>All workshop times in America/Vancouver</span>
        </footer>
      </div>
      <dialog
        ref={dialog}
        aria-label="Navigation menu"
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return
          const controls = event.currentTarget.querySelectorAll<HTMLElement>(
            'a[href], button:not(:disabled)'
          )
          const first = controls[0]
          const last = controls[controls.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last?.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first?.focus()
          }
        }}
        onClose={() => {
          setOpen(false)
          menuButton.current?.focus()
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeMenu()
        }}
        className="mobile-navigation fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-72 max-w-[90vw] border-0 bg-[#1e2a4a] p-0 text-white backdrop:bg-slate-950/50"
      >
        {sidebar(true)}
      </dialog>
    </div>
  )
}
