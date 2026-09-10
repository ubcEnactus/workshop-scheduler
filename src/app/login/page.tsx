import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, Mail, Sparkles } from 'lucide-react'
import { redirect } from 'next/navigation'
import { AuthError } from 'next-auth'

import { buttonClasses } from '@/components/ui/button'
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
    try {
      await signIn('resend', {
        email: parsed.data.email,
        redirectTo: callbackUrl ?? '/',
        redirect: false,
      })
    } catch (error) {
      if (error instanceof AuthError) redirect('/login?error=AccessDenied')
      throw error
    }
    redirect('/login/check-email')
  }

  return (
    <main className="grid min-h-screen bg-[#f4f6f9] lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
      <section className="relative hidden min-h-screen overflow-hidden bg-[#1e2a4a] text-white lg:block">
        <Image
          src="/photos/landing-banner.png"
          alt="Students taking part in an Ennovate workshop"
          fill
          priority
          className="object-cover opacity-45"
          sizes="55vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#17213b] via-[#1e2a4a]/70 to-[#1e2a4a]/20" />
        <div className="relative flex h-full flex-col justify-between p-10 xl:p-14">
          <Link href="/" className="flex w-fit items-center gap-3 text-white">
            <span className="flex size-10 items-center justify-center rounded-xl bg-amber-400 font-black text-[#1e2a4a]">
              E
            </span>
            <span>
              <span className="block text-sm font-bold tracking-wide">ENNOVATE</span>
              <span className="block text-[10px] font-semibold tracking-[0.18em] text-white/65 uppercase">
                Workshop Scheduler
              </span>
            </span>
          </Link>
          <div className="max-w-xl">
            <p className="inline-flex items-center gap-2 rounded-full bg-amber-300/15 px-3 py-1.5 text-xs font-bold tracking-wider text-amber-300 uppercase">
              <Sparkles className="size-4" aria-hidden="true" />
              Your schedule, all together
            </p>
            <p className="mt-5 text-4xl font-bold tracking-tight text-balance xl:text-5xl">
              Make every school workshop easier to deliver.
            </p>
            <p className="mt-5 max-w-md leading-7 text-white/70">
              Review published visits, keep availability current, and arrive with the details you
              need.
            </p>
          </div>
          <p className="text-xs text-white/50">Ennovate · Workshop coordination</p>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="mb-10 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-[#1e2a4a]"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to home
          </Link>

          <div className="mb-8 lg:hidden">
            <span className="flex size-11 items-center justify-center rounded-xl bg-amber-400 font-black text-[#1e2a4a]">
              E
            </span>
          </div>

          <p className="text-xs font-bold tracking-[0.15em] text-amber-700 uppercase">
            Welcome back
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#1e2a4a]">Sign in</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Enter your invited email address. We&apos;ll send you a secure, one-time sign-in link.
          </p>

          {error ? (
            <div
              role="alert"
              className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              Sign-in failed. Check the email address and try again.
            </div>
          ) : null}

          <form action={sendMagicLink} className="mt-8 space-y-5">
            <div className="field">
              <label htmlFor="email">Email</label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="input w-full pl-10"
                />
              </div>
            </div>
            <button type="submit" className={`${buttonClasses({ variant: 'primary' })} w-full`}>
              Send magic link
            </button>
          </form>

          <div className="mt-8 border-t border-slate-200 pt-6">
            <p className="text-xs leading-5 text-slate-500">
              New here? Ask an admin to add you. Only invited email addresses can sign in.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
