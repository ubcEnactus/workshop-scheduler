'use client'
import Link, { useLinkStatus } from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { parseSchedulingContext, schedulingHref } from '@/lib/scheduling/navigation'
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import {
  CalendarDays,
  LayoutDashboard,
  School,
  BookOpen,
  UserRound,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Clock3,
  LoaderCircle,
  ShieldCheck,
} from 'lucide-react'

type Role = 'ADMIN' | 'PA' | 'TEACHER'
const navigation = {
  ADMIN: [
    { href: '/admin', label: 'Overview', icon: LayoutDashboard, group: 'Workspace' },
    {
      href: '/admin/workshop-definitions',
      label: 'Workshops',
      icon: BookOpen,
      group: 'Workspace',
    },
    {
      href: '/admin/workshops',
      label: 'Calendar',
      icon: CalendarDays,
      group: 'Workspace',
    },
    {
      href: '/admin/teachers',
      label: 'Schools & teachers',
      icon: School,
      group: 'Manage',
    },
    { href: '/admin/pas', label: 'PAs', icon: UserRound, group: 'Manage' },
    { href: '/admin/admins', label: 'Admins', icon: ShieldCheck, group: 'Manage' },
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

function SidebarLinkContent({
  label,
  Icon,
}: {
  label: string
  Icon: (typeof navigation.ADMIN)[number]['icon']
}) {
  const { pending } = useLinkStatus()
  return (
    <>
      <Icon aria-hidden="true" className="size-[18px] shrink-0" />
      <span>{label}</span>
      {pending && (
        <LoaderCircle aria-hidden="true" className="ml-auto size-4 shrink-0 animate-spin" />
      )}
    </>
  )
}

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
  const search = useSearchParams()
  const context = parseSchedulingContext(Object.fromEntries(search))
  const sidebarHref = (href: string) =>
    role === 'ADMIN'
      ? schedulingHref(
          href,
          href === '/admin/workshops'
            ? {
                ...context,
                workshopDefinitionId: undefined,
                batch: undefined,
                week: undefined,
              }
            : context
        )
      : href
  const dialog = useRef<HTMLDialogElement>(null)
  const menuButton = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<{
    href: string
    label: string
  } | null>(null)
  const locationKey = `${pathname}?${search.toString()}`
  useEffect(() => setPendingNavigation(null), [locationKey])
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)')
    const closeOnDesktop = () => {
      if (desktop.matches) dialog.current?.close()
    }
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [])
  const items = navigation[role]
  const workshopContext = search.has('workshopDefinitionId')
  const adminActiveHref =
    role !== 'ADMIN'
      ? null
      : pathname.startsWith('/admin/workshop-definitions') ||
          pathname.startsWith('/admin/class-workshops') ||
          pathname.startsWith('/admin/workshops/plan') ||
          (workshopContext &&
            (pathname === '/admin/workshops' || pathname.startsWith('/admin/workshops/match')))
        ? '/admin/workshop-definitions'
        : pathname.startsWith('/admin/classes') ||
            pathname.startsWith('/admin/schools') ||
            pathname.startsWith('/admin/teachers')
          ? '/admin/teachers'
          : pathname.startsWith('/admin/admins')
            ? '/admin/admins'
            : pathname.startsWith('/admin/pas') ||
                pathname.startsWith('/admin/staffing') ||
                pathname.startsWith('/admin/workshops/match')
              ? '/admin/pas'
              : pathname.startsWith('/admin/workshops')
                ? '/admin/workshops'
                : '/admin'
  const active =
    (adminActiveHref ? items.find((item) => item.href === adminActiveHref) : undefined) ??
    items
      .filter(
        (item) =>
          pathname === item.href ||
          (item.href !== items[0].href && pathname.startsWith(item.href + '/'))
      )
      .sort((a, b) => b.href.length - a.href.length)[0] ??
    items[0]
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
  function startNavigation(href: string, label: string) {
    const next = new URL(href, window.location.href)
    if (
      next.origin !== window.location.origin ||
      (next.pathname === window.location.pathname && next.search === window.location.search)
    )
      return
    setPendingNavigation({ href: next.pathname + next.search, label })
  }
  function captureNavigationIntent(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return
    const target = event.target
    if (!(target instanceof Element)) return
    const anchor = target.closest<HTMLAnchorElement>('a[href]')
    if (
      !anchor ||
      anchor.hasAttribute('download') ||
      (anchor.target && anchor.target !== '_self') ||
      anchor.dataset.navigationFeedback === 'off'
    )
      return
    const next = new URL(anchor.href, window.location.href)
    if (next.origin !== window.location.origin) return
    if (next.pathname === window.location.pathname && next.search === window.location.search) return
    const label =
      anchor.dataset.navigationLabel ?? anchor.textContent?.replace(/\s+/g, ' ').trim() ?? 'page'
    startNavigation(next.pathname + next.search, label.slice(0, 80))
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
                      href={sidebarHref(item.href)}
                      onNavigate={() => {
                        if (mobile) closeMenu()
                        startNavigation(sidebarHref(item.href), item.label)
                      }}
                      data-navigation-label={item.label}
                      aria-current={active.href === item.href ? 'page' : undefined}
                      className={
                        'flex min-h-10 items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ' +
                        (active.href === item.href
                          ? 'bg-white/15 text-white shadow-[inset_3px_0_0_#fbbf24]'
                          : 'text-slate-300 hover:bg-white/10 hover:text-white')
                      }
                    >
                      <SidebarLinkContent label={item.label} Icon={item.icon} />
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
    <div
      className="app-shell min-h-screen bg-[#f5f6f9] text-slate-900"
      onClickCapture={captureNavigationIntent}
    >
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
        {pendingNavigation && (
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            data-navigation-pending={pendingNavigation.href}
            className="flex min-h-10 items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950 sm:px-8"
          >
            <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin" />
            Loading {pendingNavigation.label}…
          </div>
        )}
        <div
          id="main-content"
          tabIndex={-1}
          aria-busy={pendingNavigation ? 'true' : 'false'}
          className="min-w-0 outline-none"
        >
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
