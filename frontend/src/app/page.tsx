import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth'

export default async function Home() {
  const user = await getCurrentUser()

  if (!user) redirect('/login')

  const roleHome: Record<typeof user.role, string> = {
    ADMIN: '/admin',
    TEACHER: '/teacher',
    PA: '/pa',
  }

  redirect(roleHome[user.role] ?? '/login')
}
