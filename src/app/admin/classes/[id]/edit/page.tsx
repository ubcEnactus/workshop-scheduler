import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import { FormError } from '@/components/form-error'
import { DAY_LABELS } from '@/lib/time'
import { updateClassSection, addMeeting, deleteMeeting } from '../../actions'

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0')
  const m = (minutes % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}

export default async function EditClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  await requireRole('ADMIN')
  const { id } = await params
  const { error } = await searchParams

  const cls = await prisma.classSection.findUnique({
    where: { id },
    include: { meetings: { orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] } },
  })
  if (!cls) notFound()

  const [teachers, schools] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'TEACHER', OR: [{ deletedAt: null }, { id: cls.teacherId }] },
      orderBy: { name: 'asc' },
    }),
    prisma.school.findMany({
      where: { OR: [{ deletedAt: null }, { id: cls.schoolId }] },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <main className="mx-auto max-w-2xl space-y-12 px-6 py-16">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Edit class</h1>

        <div className="mt-6">
          <FormError message={error} />
        </div>

        <form action={updateClassSection} className="mt-8 space-y-4">
          <input type="hidden" name="id" value={cls.id} />
          <div>
            <label className="block text-sm font-medium">Class name</label>
            <input
              name="name"
              defaultValue={cls.name}
              required
              className="mt-1 block w-full rounded border px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">Subject (optional)</label>
              <input
                name="subject"
                defaultValue={cls.subject ?? ''}
                className="mt-1 block w-full rounded border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Grade (optional)</label>
              <input
                name="grade"
                defaultValue={cls.grade ?? ''}
                className="mt-1 block w-full rounded border px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium">Teacher</label>
            <select
              name="teacherId"
              defaultValue={cls.teacherId}
              required
              className="mt-1 block w-full rounded border px-3 py-2 text-sm"
            >
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.deletedAt ? `${t.name} (removed)` : t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">School</label>
            <select
              name="schoolId"
              defaultValue={cls.schoolId}
              required
              className="mt-1 block w-full rounded border px-3 py-2 text-sm"
            >
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.deletedAt ? `${s.name} (removed)` : s.name}
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
            <a href="/admin/classes" className="text-sm text-zinc-600 hover:underline">
              Cancel
            </a>
          </div>
        </form>
      </div>

      <div>
        <h2 className="text-lg font-medium">Meeting times</h2>

        <ul className="mt-4 divide-y">
          {cls.meetings.length === 0 && (
            <li className="py-3 text-sm text-zinc-500">No meeting times yet.</li>
          )}
          {cls.meetings.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-3">
              <span className="text-sm">
                {DAY_LABELS[m.dayOfWeek]} · {minutesToTime(m.startMinute)}–
                {minutesToTime(m.endMinute)}
              </span>
              <form action={deleteMeeting}>
                <input type="hidden" name="id" value={m.id} />
                <button type="submit" className="text-sm text-red-600 hover:underline">
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>

        <form action={addMeeting} className="mt-6 space-y-4">
          <input type="hidden" name="classSectionId" value={cls.id} />
          <h3 className="text-sm font-medium">Add meeting time</h3>
          <div>
            <label className="block text-sm font-medium">Day</label>
            <select
              name="dayOfWeek"
              required
              className="mt-1 block w-full rounded border px-3 py-2 text-sm"
            >
              {DAY_LABELS.map((label, i) => (
                <option key={i} value={i}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">Start time</label>
              <input
                name="startTime"
                type="time"
                required
                className="mt-1 block w-full rounded border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium">End time</label>
              <input
                name="endTime"
                type="time"
                required
                className="mt-1 block w-full rounded border px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            className="rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700"
          >
            Add time
          </button>
        </form>
      </div>
    </main>
  )
}
