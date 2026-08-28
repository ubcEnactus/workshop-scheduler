import { getCurrentUser, signOut } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AdminSidebar } from '@/components/admin/sidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'ADMIN') redirect('/login')

  async function signOutAction() {
    'use server'
    await signOut({ redirectTo: '/login' })
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <AdminSidebar signOutAction={signOutAction} />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
          <p className="text-sm text-gray-600">
            Welcome back, <span className="font-semibold text-gray-900">{user.name ?? user.email}</span>
          </p>
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-full bg-[#1e2a4a] text-xs font-bold text-white">
              {(user.name ?? user.email).slice(0, 2).toUpperCase()}
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-gray-900">{user.name ?? user.email}</p>
              <p className="text-[10px] text-gray-500 uppercase">Admin</p>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
