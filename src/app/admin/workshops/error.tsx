'use client'
import Link from 'next/link'
export default function WorkshopError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-6 py-12">
      <h1 className="text-2xl font-semibold">Unable to load workshops</h1>
      <p role="alert">
        The operation could not be completed. Reload the workshop to check its current state before
        retrying.
      </p>
      {error.digest && <p>Reference: {error.digest}</p>}
      <button className="rounded border px-4 py-2" onClick={reset}>
        Try again
      </button>
      <Link className="block underline" href="/admin/workshops">
        Return to workshops
      </Link>
    </main>
  )
}
