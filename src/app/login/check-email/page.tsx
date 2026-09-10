import Link from 'next/link'
import { ArrowLeft, MailCheck } from 'lucide-react'

import { buttonClasses } from '@/components/ui/button'

export default function CheckEmailPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f6f9] px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <MailCheck className="size-7" aria-hidden="true" />
        </span>
        <p className="mt-6 text-xs font-bold tracking-[0.15em] text-amber-700 uppercase">
          Link sent
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#1e2a4a]">Check your email</h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          We&apos;ve sent you a secure sign-in link. Open the email and follow the link to continue
          to your dashboard.
        </p>
        <Link href="/login" className={`${buttonClasses({ variant: 'secondary' })} mt-8`}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to sign in
        </Link>
      </div>
    </main>
  )
}
