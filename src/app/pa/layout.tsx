import { redirect } from 'next/navigation'

import { getCurrentUser, signOut } from '@/lib/auth'
import { PASidebar } from '@/components/pa/sidebar'
import { RoleShell } from '@/components/shell/role-shell'

export default async function PALayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'PA') redirect('/login')

  async function signOutAction() {
    'use server'
    await signOut({ redirectTo: '/login' })
  }

  return (
    <RoleShell
      displayName={user.name ?? user.email}
      roleLabel="PA"
      avatarClassName="bg-purple-600"
      sidebar={<PASidebar signOutAction={signOutAction} />}
    >
      {children}
    </RoleShell>
  )
}
