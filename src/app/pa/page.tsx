import Link from 'next/link'
import { requireRole, signOut } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { visibleWorkshop } from '@/lib/scheduling/visibility'
import { loadSchedule } from '@/lib/scheduling/store'
import { eligibility } from '@/lib/scheduling/eligibility'
import { PublishedWorkshops } from '@/components/published-workshops'
import { auditStateSchema } from '@/lib/schemas/changes'
import { formatInstantRange } from '@/lib/time'
export default async function PAHome() {
  const user = await requireRole('PA')
  async function logout() {
    'use server'
    await requireRole('PA')
    await signOut({ redirectTo: '/login' })
  }
  const [assignments, availabilityCount, snapshot, replacements] = await Promise.all([
    prisma.assignment.findMany({
      where: { paId: user.id, status: 'PUBLISHED', workshop: visibleWorkshop },
      include: {
        workshop: {
          include: {
            classSection: { include: { school: true } },
            events: {
              where: { kind: { not: 'PUBLISH' } },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { workshop: { scheduledStart: 'asc' } },
    }),
    prisma.availability.count({ where: { userId: user.id } }),
    loadSchedule(prisma),
    prisma.workshopEvent.findMany({
      where: {
        wasPublished: true,
        kind: 'REPLACE',
        affectedPAIds: { has: user.id },
        workshop: { classSection: { school: { deletedAt: null }, teacher: { deletedAt: null } } },
      },
      include: { workshop: { select: { classSection: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
    }),
  ])
  const items = assignments.map((a) => {
    const w = a.workshop,
      scheduled = snapshot.workshops.find((s) => s.id === w.id)
    return {
      id: w.id,
      name: w.classSection.name,
      school: w.classSection.school.name,
      start: w.scheduledStart,
      end: w.scheduledEnd,
      status: w.status,
      reason: w.events[0]?.reason,
      review:
        w.status === 'PUBLISHED' &&
        w.scheduledEnd.getTime() >= Date.now() &&
        !!scheduled &&
        eligibility(snapshot, scheduled, user.id).length > 0,
    }
  })
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold">Hello {user.name ?? user.email}</h1>
      <section className="mt-8">
        <h2 className="text-lg font-medium">Weekly availability</h2>
        <Link className="underline" href="/pa/availability">
          {availabilityCount > 0 ? 'Edit availability' : 'Submit availability'}
        </Link>
        <p className="mt-2 text-sm">
          Availability is your only scheduling input. Admins manage assignments after submission.
        </p>
      </section>
      <PublishedWorkshops
        items={items}
        upcomingTitle="Upcoming assignments"
        empty="No published workshop assignments yet."
      />
      {replacements.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-medium">Assignment changes</h2>
          <ul className="mt-3 space-y-3">
            {replacements.map((e) => {
              const after = auditStateSchema.parse(e.after),
                before = auditStateSchema.parse(e.before)
              const added =
                !before.pas.some((p) => p.id === user.id) && after.pas.some((p) => p.id === user.id)
              const removed =
                before.pas.some((p) => p.id === user.id) && !after.pas.some((p) => p.id === user.id)
              if (!added && !removed) return null
              return (
                <li className="rounded border p-3" key={e.id}>
                  <p>
                    {e.workshop.classSection.name}:{' '}
                    {removed
                      ? 'Your assignment was replaced.'
                      : 'You were assigned as a replacement.'}
                  </p>
                  <p>{formatInstantRange(new Date(after.start), new Date(after.end))}</p>
                  <p>{e.reason}</p>
                  <p className="text-sm">Recorded {formatInstantRange(e.createdAt, e.createdAt)}</p>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      <form action={logout} className="mt-10">
        <button className="underline">Sign out</button>
      </form>
    </main>
  )
}
