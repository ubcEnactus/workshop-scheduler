import Link from 'next/link'

import { requireRole, signOut } from '@/lib/auth'

const SECTIONS = [
  { href: '/admin/schools', name: 'Schools', blurb: 'Partner schools and their districts.' },
  { href: '/admin/teachers', name: 'Teachers', blurb: 'Teacher accounts and school assignments.' },
  { href: '/admin/classes', name: 'Classes', blurb: 'Class sections and weekly meeting times.' },
  { href: '/admin/cycles', name: 'Cycles', blurb: 'Open and close scheduling cycles.' },
] as const

export default async function AdminHome() {
  const user = await requireRole('ADMIN')

  async function logout() {
    'use server'
    await signOut({ redirectTo: '/login' })
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        Hello {user.name ?? user.email}, role: {user.role}
      </h1>

      <nav className="mt-8 grid gap-3 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
          >
            <p className="font-medium">{section.name}</p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{section.blurb}</p>
          </Link>
        ))}
      </nav>

      <form action={logout} className="mt-10">
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
