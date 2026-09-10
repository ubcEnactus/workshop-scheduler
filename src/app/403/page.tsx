import Link from 'next/link'
import { ArrowLeft, ShieldAlert } from 'lucide-react'

import { buttonClasses } from '@/components/ui/button'

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f6f9] px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-red-50 text-red-700">
          <ShieldAlert className="size-7" aria-hidden="true" />
        </span>
        <p className="mt-6 text-xs font-bold tracking-[0.15em] text-red-700 uppercase">
          Access restricted
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#1e2a4a]">
          You can&apos;t open this page
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          Your account doesn&apos;t have access to this area. Return to your dashboard to continue.
        </p>
        <Link href="/" className={`${buttonClasses({ variant: 'secondary' })} mt-8`}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Go to your dashboard
        </Link>
      </div>
    </main>
  )
}
