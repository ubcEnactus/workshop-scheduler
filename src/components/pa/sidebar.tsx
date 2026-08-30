'use client'

import { Calendar, ClipboardCheck, Clock, LayoutGrid } from 'lucide-react'

import { RoleSidebar, type NavItem } from '@/components/shell/role-sidebar'

const NAV_ITEMS: readonly NavItem[] = [
  { href: '/pa', label: 'Assignments', icon: LayoutGrid },
  { href: '/pa/schedule', label: 'Schedule', icon: Calendar },
  { href: '/pa/checkin', label: 'Check-in', icon: ClipboardCheck },
  { href: '/pa/availability', label: 'Availability', icon: Clock },
]

export function PASidebar({ signOutAction }: { signOutAction: () => Promise<void> }) {
  return <RoleSidebar items={NAV_ITEMS} homeHref="/pa" signOutAction={signOutAction} />
}
