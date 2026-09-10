import { requireRole, signOut } from '@/lib/auth'
import { RoleShell } from '@/components/shell/role-shell'
export default async function PALayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole('PA')
  async function logout() {
    'use server'
    await requireRole('PA')
    await signOut({ redirectTo: '/login' })
  }
  return (
    <RoleShell role="PA" displayName={user.name ?? user.email} signOutAction={logout}>
      {children}
    </RoleShell>
  )
}
