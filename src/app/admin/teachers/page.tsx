import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { FormError } from '@/components/form-error'
import { createTeacher, softDeleteTeacher } from './actions'

export default async function TeachersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireRole('ADMIN')
  const { error } = await searchParams

  const [teachers, schools] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'TEACHER', deletedAt: null },
      include: { school: true },
      orderBy: { name: 'asc' },
    }),
    prisma.school.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Teachers</h1>

      <div className="mt-6">
        <FormError message={error} />
      </div>

      <form action={createTeacher} className="mt-8 space-y-4">
        <h2 className="text-lg font-medium">Add teacher</h2>
        <div>
          <label className="block text-sm font-medium">Name</label>
          <input
            name="name"
            required
            className="mt-1 block w-full rounded border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Email</label>
          <input
            name="email"
            type="email"
            required
            className="mt-1 block w-full rounded border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">School</label>
          <select
            name="schoolId"
            required
            className="mt-1 block w-full rounded border px-3 py-2 text-sm"
          >
            <option value="">Select a school…</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700"
        >
          Add teacher
        </button>
      </form>

      <ul className="mt-12 divide-y">
        {teachers.length === 0 && <li className="py-4 text-sm text-zinc-500">No teachers yet.</li>}
        {teachers.map((teacher) => (
          <li key={teacher.id} className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium">{teacher.name}</p>
              <p className="text-sm text-zinc-500">
                {teacher.email} · {teacher.school?.name ?? '—'}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <a
                href={`/admin/teachers/${teacher.id}/edit`}
                className="text-sm text-zinc-600 hover:underline"
              >
                Edit
              </a>
              <form action={softDeleteTeacher}>
                <input type="hidden" name="id" value={teacher.id} />
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
