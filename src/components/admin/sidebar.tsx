'use client'

import {
  School,
  Users,
  BookOpen,
  Calendar,
  LayoutDashboard,
  Sparkles,
  CalendarOff,
  BarChart3,
} from 'lucide-react'

import { RoleSidebar, type NavItem } from '@/components/shell/role-sidebar'

const NAV_ITEMS: readonly NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/schools', label: 'Schools', icon: School },
  { href: '/admin/teachers', label: 'Teachers', icon: Users },
  { href: '/admin/classes', label: 'Classes', icon: BookOpen },
  { href: '/admin/cycles', label: 'Rounds', icon: Calendar },
  { href: '/admin/blocked-dates', label: 'Blocked dates', icon: CalendarOff },
  { href: '/admin/heatmap', label: 'PA heatmap', icon: BarChart3 },
  { href: '/admin/schedule', label: 'Schedule & review', icon: Sparkles },
]

export function AdminSidebar({ signOutAction }: { signOutAction: () => Promise<void> }) {
  return <RoleSidebar items={NAV_ITEMS} homeHref="/admin" signOutAction={signOutAction} />
}
