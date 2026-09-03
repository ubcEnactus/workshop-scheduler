import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { FormError } from '@/components/form-error'
import { createClassSection, deleteClassSection } from './actions'

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireRole('ADMIN')
  const { error } = await searchParams

  const [classes, teachers] = await Promise.all([
    prisma.classSection.findMany({
      where: { school: { deletedAt: null }, teacher: { deletedAt: null } },
      include: { teacher: true, school: true, meetings: true },
      orderBy: { name: 'asc' },
    }),
    prisma.user.findMany({
      where: { role: 'TEACHER', deletedAt: null, school: { deletedAt: null } },
      include: { school: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Classes</h1>

      <div className="mt-6">
        <FormError message={error} />
      </div>

      <form action={createClassSection} className="mt-8 space-y-4">
        <h2 className="text-lg font-medium">Add class</h2>
        <div>
          <label className="block text-sm font-medium">Class name</label>
          <input
            name="name"
            required
            placeholder="e.g. Period 3 Biology"
            className="mt-1 block w-full rounded border px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">Subject (optional)</label>
            <input name="subject" className="mt-1 block w-full rounded border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium">Grade (optional)</label>
            <input name="grade" className="mt-1 block w-full rounded border px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium">Teacher</label>
          <select
            name="teacherId"
            required
            className="mt-1 block w-full rounded border px-3 py-2 text-sm"
          >
            <option value="">Select a teacher…</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.school?.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700"
        >
          Add class
        </button>
      </form>

      <ul className="mt-12 divide-y">
        {classes.length === 0 && <li className="py-4 text-sm text-zinc-500">No classes yet.</li>}
        {classes.map((cls) => (
          <li key={cls.id} className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium">{cls.name}</p>
              <p className="text-sm text-zinc-500">
                {cls.teacher.name} · {cls.school.name}
                {cls.subject ? ` · ${cls.subject}` : ''}
                {cls.grade ? ` · Grade ${cls.grade}` : ''}
              </p>
              <p className="text-xs text-zinc-400">
                {cls.meetings.length} meeting time{cls.meetings.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <a
                href={`/admin/classes/${cls.id}/edit`}
                className="text-sm text-zinc-600 hover:underline"
              >
                Edit
              </a>
              <form action={deleteClassSection}>
                <input type="hidden" name="id" value={cls.id} />
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
