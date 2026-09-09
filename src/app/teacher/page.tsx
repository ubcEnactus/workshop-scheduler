import { requireRole, signOut } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { visibleWorkshop } from '@/lib/scheduling/visibility'
import { PublishedWorkshops } from '@/components/published-workshops'
export default async function TeacherHome() {
  const user = await requireRole('TEACHER')
  async function logout() {
    'use server'
    await requireRole('TEACHER')
    await signOut({ redirectTo: '/login' })
  }
  const workshops = user.schoolId
    ? await prisma.workshop.findMany({
        where: { AND: [visibleWorkshop, { classSection: { schoolId: user.schoolId } }] },
        include: {
          classSection: { select: { name: true } },
          assignments: {
            where: { status: 'PUBLISHED', pa: { deletedAt: null, role: 'PA' } },
            include: { pa: { select: { name: true, email: true } } },
          },
          events: { where: { kind: { not: 'PUBLISH' } }, orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: { scheduledStart: 'asc' },
      })
    : []
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold">Hello {user.name ?? user.email}</h1>
      <p className="mt-2 text-sm">
        Your account is view-only. An admin manages class times, workshops, and instructors.
      </p>
      {!user.schoolId && (
        <p>Your account is not linked to a school yet. Ask an admin to update it.</p>
      )}
      <PublishedWorkshops
        upcomingTitle="Upcoming workshops at your school"
        empty="No published workshops are currently scheduled."
        items={workshops.map((w) => ({
          id: w.id,
          name: w.classSection.name,
          start: w.scheduledStart,
          end: w.scheduledEnd,
          status: w.status,
          pas: w.assignments.map((a) => a.pa.name ?? a.pa.email).join(', '),
          reason: w.events[0]?.reason,
        }))}
      />
      <form action={logout} className="mt-10">
        <button className="underline">Sign out</button>
      </form>
    </main>
  )
}
