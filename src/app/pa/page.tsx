import Link from 'next/link'

import { requireRole, signOut } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { formatInstant, formatInstantRange } from '@/lib/time'

function workshopTime(start: Date | null, end: Date | null): string {
  if (start && end) return formatInstantRange(start, end)
  if (start) return formatInstant(start)
  return 'Not scheduled yet'
}

export default async function PAHome() {
  const user = await requireRole('PA')

  async function logout() {
    'use server'
    await signOut({ redirectTo: '/login' })
  }

  const assignments = await prisma.assignment.findMany({
    where: { paId: user.id },
    include: {
      workshop: {
        include: {
          classSection: { select: { name: true, school: { select: { name: true } } } },
          cycle: { select: { name: true } },
        },
      },
    },
    orderBy: [
      { workshop: { scheduledStart: { sort: 'asc', nulls: 'last' } } },
      { assignedAt: 'asc' },
    ],
  })

  const availabilityCount = await prisma.availability.count({ where: { userId: user.id } })

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
            {availabilityCount > 0 ? 'Edit availability' : 'Set your availability'}
          </Link>
        </div>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {availabilityCount > 0
            ? `You've marked ${availabilityCount} slot${availabilityCount === 1 ? '' : 's'}.`
            : "You haven't submitted availability yet."}
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium">Your workshop assignments</h2>
        {assignments.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            No workshop assignments yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {assignments.map((a) => (
              <li
                key={a.id}
                className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium">{a.workshop.classSection.name}</p>
                  <span className="text-xs text-zinc-500">
                    {a.workshop.status} · {a.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {a.workshop.classSection.school.name} · {a.workshop.cycle.name}
                </p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {workshopTime(a.workshop.scheduledStart, a.workshop.scheduledEnd)}
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
