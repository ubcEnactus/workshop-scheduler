import { requireRole, signOut } from '@/lib/auth'
import { RoleShell } from '@/components/shell/role-shell'
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole('ADMIN')
  async function logout() {
    'use server'
    await requireRole('ADMIN')
    await signOut({ redirectTo: '/login' })
  }
  return (
    <RoleShell role="ADMIN" displayName={user.name ?? user.email} signOutAction={logout}>
      {children}
    </RoleShell>
  )
}
