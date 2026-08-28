import { redirect } from 'next/navigation'

import { getCurrentUser, signOut } from '@/lib/auth'
import { AdminSidebar } from '@/components/admin/sidebar'
import { RoleShell } from '@/components/shell/role-shell'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'ADMIN') redirect('/login')

  async function signOutAction() {
    'use server'
    await signOut({ redirectTo: '/login' })
  }

  return (
    <RoleShell
      displayName={user.name ?? user.email}
      roleLabel="Admin"
      avatarClassName="bg-[#1e2a4a]"
      sidebar={<AdminSidebar signOutAction={signOutAction} />}
    >
      {children}
    </RoleShell>
  )
}
