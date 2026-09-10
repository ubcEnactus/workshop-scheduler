import { requireRole, signOut } from '@/lib/auth'
import { RoleShell } from '@/components/shell/role-shell'
export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole('TEACHER')
  async function logout() {
    'use server'
    await requireRole('TEACHER')
    await signOut({ redirectTo: '/login' })
  }
  return (
    <RoleShell role="TEACHER" displayName={user.name ?? user.email} signOutAction={logout}>
      {children}
    </RoleShell>
  )
}
