import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { createSchool, softDeleteSchool } from './actions'

export default async function SchoolsPage() {
  await requireRole('ADMIN')

  const schools = await prisma.school.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
  })

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Schools</h1>

      <form action={createSchool} className="mt-8 space-y-4">
        <h2 className="text-lg font-medium">Add school</h2>
        <div>
          <label className="block text-sm font-medium">Name</label>
          <input
            name="name"
            required
            className="mt-1 block w-full rounded border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">District</label>
          <input
            name="district"
            required
            className="mt-1 block w-full rounded border px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700"
        >
          Add school
        </button>
      </form>

      <ul className="mt-12 divide-y">
        {schools.length === 0 && (
          <li className="py-4 text-sm text-zinc-500">No schools yet.</li>
        )}
        {schools.map((school) => (
          <li key={school.id} className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium">{school.name}</p>
              <p className="text-sm text-zinc-500">{school.district}</p>
            </div>
            <div className="flex items-center gap-4">
              <a
                href={`/admin/schools/${school.id}/edit`}
                className="text-sm text-zinc-600 hover:underline"
              >
                Edit
              </a>
              <form action={softDeleteSchool}>
                <input type="hidden" name="id" value={school.id} />
                <button type="submit" className="text-sm text-red-600 hover:underline">
                  Delete
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}
