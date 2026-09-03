import { requireRole, signOut } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { formatInstantRange } from '@/lib/time'

export default async function TeacherHome() {
  const user = await requireRole('TEACHER')

  async function logout() {
    'use server'
    await requireRole('TEACHER')
    await signOut({ redirectTo: '/login' })
  }

  const workshops = user.schoolId
    ? await prisma.workshop.findMany({
        where: {
          status: 'CONFIRMED',
          scheduledStart: { gte: new Date() },
          classSection: { schoolId: user.schoolId, school: { deletedAt: null } },
        },
        include: {
          classSection: { select: { name: true } },
          assignments: {
            where: { status: 'CONFIRMED' },
            include: { pa: { select: { name: true, email: true } } },
          },
        },
        orderBy: { scheduledStart: 'asc' },
      })
    : []

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Hello {user.name ?? user.email}</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Your account is view-only. An admin manages class times, workshops, and instructors.
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-medium">Upcoming workshops at your school</h2>
        {!user.schoolId ? (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Your account is not linked to a school yet. Ask an admin to update it.
          </p>
        ) : workshops.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            No published workshops are currently scheduled.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {workshops.map((workshop) => (
              <li
                key={workshop.id}
                className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <p className="font-medium">{workshop.classSection.name}</p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {workshop.scheduledStart && workshop.scheduledEnd
                    ? formatInstantRange(workshop.scheduledStart, workshop.scheduledEnd)
                    : 'Time unavailable'}
                </p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  PAs:{' '}
                  {workshop.assignments
                    .map((assignment) => assignment.pa.name ?? assignment.pa.email)
                    .join(', ') || 'Not assigned'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form action={logout} className="mt-10">
        <button
          type="submit"
          className="text-xs font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Sign out
        </button>
      </form>
    </main>
  )
}
