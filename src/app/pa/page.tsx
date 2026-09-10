import Link from 'next/link'
import { AlertTriangle, CalendarCheck2, CalendarClock, Clock3, MapPin } from 'lucide-react'

import { PublishedWorkshops } from '@/components/published-workshops'
import { buttonClasses } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { StatCard } from '@/components/ui/stat-card'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { auditStateSchema } from '@/lib/schemas/changes'
import { eligibility } from '@/lib/scheduling/eligibility'
import { loadSchedule } from '@/lib/scheduling/store'
import { visibleWorkshop } from '@/lib/scheduling/visibility'
import { formatInstantRange } from '@/lib/time'

export default async function PAHome() {
  const user = await requireRole('PA')

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

  const now = Date.now()
  const items = assignments.map((assignment) => {
    const workshop = assignment.workshop
    const scheduled = snapshot.workshops.find((candidate) => candidate.id === workshop.id)
    return {
      id: workshop.id,
      name: workshop.classSection.name,
      school: workshop.classSection.school.name,
      start: workshop.scheduledStart,
      end: workshop.scheduledEnd,
      status: workshop.status,
      reason: workshop.events[0]?.reason,
      review:
        workshop.status === 'PUBLISHED' &&
        workshop.scheduledEnd.getTime() >= now &&
        !!scheduled &&
        eligibility(snapshot, scheduled, user.id).length > 0,
    }
  })
  const upcoming = items.filter((item) => item.status === 'PUBLISHED' && item.end.getTime() >= now)
  const schools = new Set(items.map((item) => item.school))

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Program assistant dashboard"
        title={`Hello ${user.name ?? user.email}`}
        description="Your published workshop commitments and recurring weekly availability. Admins manage all assignment changes."
        actions={
          <Link href="/pa/availability" className={buttonClasses({ variant: 'primary' })}>
            <Clock3 className="size-4" aria-hidden="true" />
            {availabilityCount > 0 ? 'Edit availability' : 'Submit availability'}
          </Link>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Assignment summary">
        <StatCard
          label="Upcoming"
          value={upcoming.length}
          detail="Published assignments"
          icon={<CalendarClock />}
          tone="blue"
        />
        <StatCard
          label="Availability"
          value={availabilityCount}
          detail="Weekly half-hour slots"
          icon={<Clock3 />}
          tone={availabilityCount > 0 ? 'green' : 'amber'}
        />
        <StatCard
          label="Schools"
          value={schools.size}
          detail="Across your schedule"
          icon={<MapPin />}
          tone="slate"
        />
        <StatCard
          label="History"
          value={items.length - upcoming.length}
          detail="Past or changed workshops"
          icon={<CalendarCheck2 />}
          tone="slate"
        />
      </section>

      <Panel
        title="Weekly availability"
        description="Availability is your only scheduling input. Saving it never accepts, declines, or changes an assignment."
      >
        <p className="text-sm leading-6 text-slate-600">
          {availabilityCount > 0
            ? `${availabilityCount} recurring half-hour slots are saved for Monday through Friday.`
            : 'No recurring availability is saved yet. Add the school-hour slots when you can facilitate.'}
        </p>
      </Panel>

      <PublishedWorkshops
        items={items}
        upcomingTitle="Upcoming assignments"
        empty="No published workshop assignments yet."
      />

      {replacements.length > 0 ? (
        <Panel
          title="Assignment changes"
          description="A record of published assignments added or removed by an admin."
        >
          <ul className="divide-y divide-slate-100">
            {replacements.map((event) => {
              const after = auditStateSchema.parse(event.after)
              const before = auditStateSchema.parse(event.before)
              const added =
                !before.pas.some((pa) => pa.id === user.id) &&
                after.pas.some((pa) => pa.id === user.id)
              const removed =
                before.pas.some((pa) => pa.id === user.id) &&
                !after.pas.some((pa) => pa.id === user.id)
              if (!added && !removed) return null

              return (
                <li key={event.id} className="flex gap-3 py-4 first:pt-0 last:pb-0">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                    <AlertTriangle className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {event.workshop.classSection.name}:{' '}
                      {removed
                        ? 'Your assignment was replaced.'
                        : 'You were assigned as a replacement.'}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatInstantRange(new Date(after.start), new Date(after.end))}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">{event.reason}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Recorded {formatInstantRange(event.createdAt, event.createdAt)}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </Panel>
      ) : null}
    </main>
  )
}
