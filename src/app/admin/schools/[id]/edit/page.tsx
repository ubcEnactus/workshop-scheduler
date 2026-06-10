import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import { updateSchool } from '../../actions'

export default async function EditSchoolPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireRole('ADMIN')
  const { id } = await params

  const school = await prisma.school.findFirst({
    where: { id, deletedAt: null },
  })
  if (!school) notFound()

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Edit school</h1>

      <form action={updateSchool} className="mt-8 space-y-4">
        <input type="hidden" name="id" value={school.id} />
        <div>
          <label className="block text-sm font-medium">Name</label>
          <input
            name="name"
            defaultValue={school.name}
            required
            className="mt-1 block w-full rounded border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">District</label>
          <input
            name="district"
            defaultValue={school.district}
            required
            className="mt-1 block w-full rounded border px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-center gap-4">
          <button
            type="submit"
            className="rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700"
          >
            Save
          </button>
          <a href="/admin/schools" className="text-sm text-zinc-600 hover:underline">
            Cancel
          </a>
        </div>
      </form>
    </main>
  )
}
