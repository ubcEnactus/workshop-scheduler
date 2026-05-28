import Link from 'next/link'

export default function ForbiddenPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Forbidden</h1>
        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
          Your account doesn&apos;t have access to this area.
        </p>
        <Link
          href="/"
          className="text-sm font-medium text-zinc-900 underline underline-offset-4 dark:text-zinc-100"
        >
          Go to your dashboard
        </Link>
      </div>
    </main>
  )
}
