import { redirect } from 'next/navigation'

import { getCurrentUser, signOut } from '@/lib/auth'
import { TeacherSidebar } from '@/components/teacher/sidebar'
import { RoleShell } from '@/components/shell/role-shell'

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'TEACHER') redirect('/login')

  async function signOutAction() {
    'use server'
    await signOut({ redirectTo: '/login' })
  }

  return (
    <RoleShell
      displayName={user.name ?? user.email}
      roleLabel="Teacher"
      avatarClassName="bg-green-600"
      sidebar={<TeacherSidebar signOutAction={signOutAction} />}
    >
      {children}
    </RoleShell>
  )
}
