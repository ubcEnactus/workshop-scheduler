import Link from 'next/link'

import { FormError } from '@/components/form-error'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'

import { createPA, softDeletePA } from './actions'

export default async function PAsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireRole('ADMIN')
  const { error } = await searchParams

  const pas = await prisma.user.findMany({
    where: { role: 'PA', deletedAt: null },
    orderBy: [{ name: 'asc' }, { email: 'asc' }],
  })

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link href="/admin" className="text-sm text-zinc-600 hover:underline">
        ← Back to admin
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">PAs</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Add an instructor before they request a magic link. Removed accounts cannot sign in.
      </p>

      <div className="mt-6">
        <FormError message={error} />
      </div>

      <form action={createPA} className="mt-8 space-y-4">
        <h2 className="text-lg font-medium">Add PA</h2>
        <div>
          <label className="block text-sm font-medium">Name</label>
          <input name="name" required className="mt-1 block w-full rounded border px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium">Email</label>
          <input
            name="email"
            type="email"
            required
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </div>
        <button
          type="submit"
          className="rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700"
        >
          Add PA
        </button>
      </form>

      <ul className="mt-12 divide-y">
        {pas.length === 0 ? <li className="py-4 text-sm text-zinc-500">No PAs yet.</li> : null}
        {pas.map((pa) => (
          <li key={pa.id} className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="font-medium">{pa.name ?? 'Unnamed PA'}</p>
              <p className="text-sm text-zinc-500">{pa.email}</p>
            </div>
            <div className="flex items-center gap-4">
              <Link href={`/admin/pas/${pa.id}/edit`} className="text-sm hover:underline">
                Edit
              </Link>
              <form action={softDeletePA}>
                <input type="hidden" name="id" value={pa.id} />
                <button type="submit" className="text-sm text-red-600 hover:underline">
                  Remove
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}
