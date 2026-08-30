'use client'

import { Calendar, Clock, LayoutGrid } from 'lucide-react'

import { RoleSidebar, type NavItem } from '@/components/shell/role-sidebar'

const NAV_ITEMS: readonly NavItem[] = [
  { href: '/teacher', label: 'My workshops', icon: LayoutGrid },
  { href: '/teacher/availability', label: 'Availability', icon: Clock },
  { href: '/teacher/schedule', label: 'Schedule', icon: Calendar },
]

export function TeacherSidebar({ signOutAction }: { signOutAction: () => Promise<void> }) {
  return <RoleSidebar items={NAV_ITEMS} homeHref="/teacher" signOutAction={signOutAction} />
}
