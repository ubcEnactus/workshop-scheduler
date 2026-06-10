import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import { updateTeacher } from '../../actions'

export default async function EditTeacherPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole('ADMIN')
  const { id } = await params

  const [teacher, schools] = await Promise.all([
    prisma.user.findFirst({
      where: { id, role: 'TEACHER', deletedAt: null },
    }),
    prisma.school.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    }),
  ])
  if (!teacher) notFound()

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Edit teacher</h1>

      <form action={updateTeacher} className="mt-8 space-y-4">
        <input type="hidden" name="id" value={teacher.id} />
        <div>
          <label className="block text-sm font-medium">Name</label>
          <input
            name="name"
            defaultValue={teacher.name ?? ''}
            required
            className="mt-1 block w-full rounded border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Email</label>
          <input
            name="email"
            type="email"
            defaultValue={teacher.email}
            required
            className="mt-1 block w-full rounded border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">School</label>
          <select
            name="schoolId"
            defaultValue={teacher.schoolId ?? ''}
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
        <div className="flex items-center gap-4">
          <button
            type="submit"
            className="rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700"
          >
            Save
          </button>
          <a href="/admin/teachers" className="text-sm text-zinc-600 hover:underline">
            Cancel
          </a>
        </div>
      </form>
    </main>
  )
}
