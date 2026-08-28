import { redirect } from 'next/navigation'
import Image from 'next/image'
import { LogIn, Sparkles } from 'lucide-react'

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
    <main className="relative flex min-h-screen items-center justify-center p-4">
      {/* Background image */}
      <Image
        src="/photos/landing-banner.png"
        alt=""
        fill
        className="object-cover"
        priority
      />
      <div className="absolute inset-0 bg-black/30" />

      {/* Card container */}
      <div className="relative z-10 flex w-full max-w-[900px] overflow-hidden rounded-2xl shadow-2xl">
        {/* Left panel - branding */}
        <div className="hidden w-[45%] flex-col justify-between bg-[#1e2a4a] p-8 md:flex">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-amber-400">
              <svg className="size-5 text-[#1e2a4a]" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 3a1 1 0 011 1v4h4a1 1 0 110 2h-4v4a1 1 0 11-2 0v-4H5a1 1 0 110-2h4V4a1 1 0 011-1z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-white">Workshop</p>
              <p className="text-[10px] font-medium tracking-widest text-white/60 uppercase">
                Ennovate
              </p>
            </div>
          </div>

          <div>
            <div className="mb-6 inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 px-3 py-1">
              <Sparkles className="size-3.5 text-amber-400" />
              <span className="text-xs font-semibold text-amber-400 uppercase">Prototype</span>
            </div>

            <h1 className="text-3xl font-bold leading-tight text-white">
              Schedule every workshop, for every class, in every school.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-white/70">
              One workspace for admins, teachers, and program assistants to plan, run, and review
              Ennovate sessions.
            </p>
          </div>

          <p className="text-xs text-white/40">&copy; 2026 Ennovate &middot; Internal tool</p>
        </div>

        {/* Right panel - sign in form */}
        <div className="flex w-full flex-col justify-center bg-white p-8 md:w-[55%] md:p-12">
          <h2 className="text-2xl font-bold text-[#1e2a4a]">Sign in</h2>
          <p className="mt-1 text-sm text-gray-500">
            Use your workshop credentials to continue.
          </p>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Sign-in failed. Check the email address and try again.
            </div>
          )}

          <form action={sendMagicLink} className="mt-8 space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="admin@workshop.org"
                className="mt-1.5 block w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#1e2a4a] focus:ring-1 focus:ring-[#1e2a4a] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••••"
                className="mt-1.5 block w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#1e2a4a] focus:ring-1 focus:ring-[#1e2a4a] focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  className="size-4 rounded border-gray-300 text-[#1e2a4a] focus:ring-[#1e2a4a]"
                />
                Remember me
              </label>
              <span className="text-sm font-medium text-[#1e2a4a]">
                Forgot password?
              </span>
            </div>

            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1e2a4a] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#2a3a5e]"
            >
              <LogIn className="size-4" />
              Sign in as Admin
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
