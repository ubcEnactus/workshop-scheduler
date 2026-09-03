import Link from 'next/link'
import { notFound } from 'next/navigation'

import { FormError } from '@/components/form-error'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'

import { updatePA } from '../../actions'

export default async function EditPAPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  await requireRole('ADMIN')
  const { id } = await params
  const { error } = await searchParams

  const pa = await prisma.user.findFirst({ where: { id, role: 'PA', deletedAt: null } })
  if (!pa) notFound()

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link href="/admin/pas" className="text-sm text-zinc-600 hover:underline">
        ← Back to PAs
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Edit PA</h1>

      <div className="mt-6">
        <FormError message={error} />
      </div>

      <form action={updatePA} className="mt-8 space-y-4">
        <input type="hidden" name="id" value={pa.id} />
        <div>
          <label className="block text-sm font-medium">Name</label>
          <input
            name="name"
            defaultValue={pa.name ?? ''}
            required
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Email</label>
          <input
            name="email"
            type="email"
            defaultValue={pa.email}
            required
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </div>
        <button
          type="submit"
          className="rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700"
        >
          Save changes
        </button>
      </form>
    </main>
  )
}
