import { requireRole, signOut } from '@/lib/auth'

export default async function TeacherHome() {
  const user = await requireRole('TEACHER')

  async function logout() {
    'use server'
    await signOut({ redirectTo: '/login' })
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        Hello {user.name ?? user.email}, role: {user.role}
      </h1>
      <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        Teacher landing page. Build out from here.
      </p>
      <form action={logout} className="mt-8">
        <button
          type="submit"
          className="text-xs font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Sign out
        </button>
      </form>
    </main>
  )
}
