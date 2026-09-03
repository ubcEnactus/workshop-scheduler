import Link from 'next/link'

import { requireRole, signOut } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { formatInstantRange } from '@/lib/time'

export default async function PAHome() {
  const user = await requireRole('PA')

  async function logout() {
    'use server'
    await requireRole('PA')
    await signOut({ redirectTo: '/login' })
  }

  const [assignments, availabilityCount] = await Promise.all([
    prisma.assignment.findMany({
      where: {
        paId: user.id,
        status: 'CONFIRMED',
        workshop: { status: 'CONFIRMED', scheduledStart: { gte: new Date() } },
      },
      include: {
        workshop: {
          include: {
            classSection: { select: { name: true, school: { select: { name: true } } } },
          },
        },
      },
      orderBy: { workshop: { scheduledStart: 'asc' } },
    }),
    prisma.availability.count({ where: { userId: user.id } }),
  ])

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Hello {user.name ?? user.email}</h1>

      <section className="mt-8">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-medium">Weekly availability</h2>
          <Link
            href="/pa/availability"
            className="text-sm font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            {availabilityCount > 0 ? 'Edit availability' : 'Submit availability'}
          </Link>
        </div>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Availability is your only scheduling input. Admins manage assignments after submission.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium">Upcoming assignments</h2>
        {assignments.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            No published workshop assignments yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {assignments.map((assignment) => {
              const { workshop } = assignment
              return (
                <li
                  key={assignment.id}
                  className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <p className="font-medium">{workshop.classSection.name}</p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {workshop.classSection.school.name}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {workshop.scheduledStart && workshop.scheduledEnd
                      ? formatInstantRange(workshop.scheduledStart, workshop.scheduledEnd)
                      : 'Time unavailable'}
                  </p>
                </li>
              )
            })}
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
