import { redirect } from 'next/navigation'

import { getCurrentUser, signIn } from '@/lib/auth'
import { loginSchema } from '@/lib/schemas/auth'

type SearchParams = Promise<{ callbackUrl?: string; error?: string }>

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getCurrentUser()
  if (user) redirect('/')

  const { callbackUrl, error } = await searchParams

  async function sendMagicLink(formData: FormData) {
    'use server'
    const parsed = loginSchema.safeParse({ email: formData.get('email') })
    if (!parsed.success) {
      redirect('/login?error=InvalidEmail')
    }
    await signIn('resend', {
      email: parsed.data.email,
      redirectTo: callbackUrl ?? '/',
    })
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
          We&apos;ll email you a magic link.
        </p>

        {error ? (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            Sign-in failed. Check the email address and try again.
          </div>
        ) : null}

        <form action={sendMagicLink} className="flex flex-col gap-3">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-100"
          />
          <button
            type="submit"
            className="mt-2 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Send magic link
          </button>
        </form>

        <p className="mt-6 text-xs text-zinc-500">
          New here? Ask an admin to add you — only invited emails can sign in.
        </p>
      </div>
    </main>
  )
}
