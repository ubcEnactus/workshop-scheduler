import Link from 'next/link'
import { AlertTriangle, CalendarCheck2, CalendarClock, Clock3, MapPin } from 'lucide-react'

import { PublishedWorkshops } from '@/components/published-workshops'
import { HistoryPagination } from '@/components/history-pagination'
import { buttonClasses } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { StatCard } from '@/components/ui/stat-card'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { auditStateSchema } from '@/lib/schemas/changes'
import { eligibility } from '@/lib/scheduling/eligibility'
import { participantChangeSummary } from '@/lib/scheduling/participant-change-summary'
import { loadSchedule } from '@/lib/scheduling/store'
import { visibleWorkshop } from '@/lib/scheduling/visibility'
import { formatInstantRange, vancouverDateKey } from '@/lib/time'

const PAGE_SIZE = 20

function pageNumber(value: string | undefined) {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? Math.min(page, 10_000) : 1
}

async function replacementPage(paId: string, page: number) {
  const ids = await prisma.$queryRaw<{ id: string }[]>`
    SELECT event.id
    FROM "WorkshopEvent" AS event
    WHERE event."wasPublished" = true
      AND event.kind IN ('REPLACE', 'EDIT')
      AND event."affectedPAIds" @> ARRAY[${paId}]::text[]
      AND (
        EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(event."before" -> 'pas', '[]'::jsonb)) AS pa
          WHERE pa ->> 'id' = ${paId}
        )
        <>
        EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(event."after" -> 'pas', '[]'::jsonb)) AS pa
          WHERE pa ->> 'id' = ${paId}
        )
      )
    ORDER BY event."createdAt" DESC, event.id DESC
    LIMIT ${PAGE_SIZE + 1}
    OFFSET ${(page - 1) * PAGE_SIZE}
  `
  const events = await prisma.workshopEvent.findMany({
    where: { id: { in: ids.map(({ id }) => id) } },
    select: {
      id: true,
      before: true,
      after: true,
      createdAt: true,
      workshopSession: {
        select: {
          hostClassName: true,
          classWorkshop: { select: { classSection: { select: { name: true } } } },
        },
      },
    },
  })
  const byId = new Map(events.map((event) => [event.id, event]))
  return ids.flatMap(({ id }) => {
    const event = byId.get(id)
    return event ? [event] : []
  })
}

export default async function PAHome({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requireRole('PA')
  const query = await searchParams
  const upcomingPage = pageNumber(query.upcomingPage)
  const historyPage = pageNumber(query.historyPage)
  const changePage = pageNumber(query.changePage)
  const now = new Date()
  const today = new Date(`${vancouverDateKey(now)}T00:00:00Z`)
  const participantWorkshop = {
    id: true,
    hostClassName: true,
    hostSchoolName: true,
    mode: true,
    location: true,
    participantInstructions: true,
    scheduledStart: true,
    scheduledEnd: true,
    status: true,
    classWorkshop: {
      select: {
        workshopDefinition: { select: { title: true } },
        classSection: { select: { name: true, school: { select: { name: true } } } },
      },
    },
    events: {
      where: { wasPublished: true, kind: { notIn: ['PUBLISH', 'INTERNAL_EDIT'] } },
      select: { id: true, kind: true, before: true, after: true },
      orderBy: { createdAt: 'desc' as const },
      take: 1,
    },
  }

  const [
    upcomingRows,
    historyRows,
    availabilityCount,
    upcomingCount,
    historyCount,
    schoolCount,
    replacementRows,
  ] = await Promise.all([
    prisma.assignment.findMany({
      where: {
        paId: user.id,
        status: 'PUBLISHED',
        workshopSession: {
          status: 'PUBLISHED',
          scheduledEnd: { gte: now },
          classWorkshop: { classSection: { school: { deletedAt: null } } },
        },
      },
      select: { workshopSession: { select: participantWorkshop } },
      orderBy: [{ workshopSession: { scheduledStart: 'asc' } }, { workshopSessionId: 'asc' }],
      skip: (upcomingPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE + 1,
    }),
    prisma.assignment.findMany({
      where: {
        paId: user.id,
        status: 'PUBLISHED',
        workshopSession: {
          AND: [
            visibleWorkshop,
            {
              OR: [
                { status: 'PUBLISHED', scheduledEnd: { lt: now } },
                { status: { in: ['CANCELLED', 'COMPLETED'] }, publishedAt: { not: null } },
              ],
            },
          ],
        },
      },
      select: { workshopSession: { select: participantWorkshop } },
      orderBy: [{ workshopSession: { scheduledStart: 'desc' } }, { workshopSessionId: 'desc' }],
      skip: (historyPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE + 1,
    }),
    prisma.availability.count({
      where: {
        userId: user.id,
        effectiveFrom: { lte: today },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: today } }],
      },
    }),
    prisma.assignment.count({
      where: {
        paId: user.id,
        status: 'PUBLISHED',
        workshopSession: {
          status: 'PUBLISHED',
          scheduledEnd: { gte: now },
          classWorkshop: { classSection: { school: { deletedAt: null } } },
        },
      },
    }),
    prisma.assignment.count({
      where: {
        paId: user.id,
        status: 'PUBLISHED',
        workshopSession: {
          AND: [
            visibleWorkshop,
            {
              OR: [
                { status: 'PUBLISHED', scheduledEnd: { lt: now } },
                { status: { in: ['CANCELLED', 'COMPLETED'] }, publishedAt: { not: null } },
              ],
            },
          ],
        },
      },
    }),
    prisma.school.count({
      where: {
        deletedAt: null,
        classSections: {
          some: {
            classWorkshops: {
              some: {
                sessions: {
                  some: {
                    AND: [
                      visibleWorkshop,
                      { assignments: { some: { paId: user.id, status: 'PUBLISHED' } } },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    }),
    replacementPage(user.id, changePage),
  ])

  const upcoming = upcomingRows.slice(0, PAGE_SIZE)
  const history = historyRows.slice(0, PAGE_SIZE)
  const replacements = replacementRows.slice(0, PAGE_SIZE)
  const upcomingIds = upcoming.map((assignment) => assignment.workshopSession.id)
  const snapshot = upcomingIds.length
    ? await loadSchedule(prisma, { kind: 'sessions', workshopSessionIds: upcomingIds })
    : undefined
  const items = [...upcoming, ...history].map((assignment) => {
    const workshop = assignment.workshopSession
    const scheduled = snapshot?.workshops.find((candidate) => candidate.id === workshop.id)
    return {
      id: workshop.id,
      name: workshop.hostClassName ?? workshop.classWorkshop.classSection.name,
      definitionTitle: workshop.classWorkshop.workshopDefinition.title,
      school: workshop.hostSchoolName ?? workshop.classWorkshop.classSection.school.name,
      mode: workshop.mode,
      location: workshop.location,
      participantInstructions: workshop.participantInstructions,
      start: workshop.scheduledStart,
      end: workshop.scheduledEnd,
      status: workshop.status,
      reason: workshop.events[0] ? participantChangeSummary(workshop.events[0]) : undefined,
      review:
        workshop.status === 'PUBLISHED' &&
        workshop.scheduledEnd >= now &&
        !!scheduled &&
        !!snapshot &&
        eligibility(snapshot, scheduled, user.id).length > 0,
    }
  })
  const replacementItems = replacements.flatMap((event) => {
    const after = auditStateSchema.parse(event.after)
    const before = auditStateSchema.parse(event.before)
    const added =
      !before.pas.some((pa) => pa.id === user.id) && after.pas.some((pa) => pa.id === user.id)
    const removed =
      before.pas.some((pa) => pa.id === user.id) && !after.pas.some((pa) => pa.id === user.id)
    return added || removed ? [{ event, after, removed }] : []
  })

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
          value={upcomingCount}
          detail="Published assignments"
          icon={<CalendarClock />}
          tone="blue"
        />
        <StatCard
          label="Availability"
          value={availabilityCount}
          detail="Weekly 15-minute slots"
          icon={<Clock3 />}
          tone={availabilityCount > 0 ? 'green' : 'amber'}
        />
        <StatCard
          label="Schools"
          value={schoolCount}
          detail="Across your schedule"
          icon={<MapPin />}
          tone="slate"
        />
        <StatCard
          label="History"
          value={historyCount}
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
            ? `${availabilityCount} recurring 15-minute slots are saved for Monday through Friday.`
            : 'No recurring availability is saved yet. Add the school-hour slots when you can facilitate.'}
        </p>
      </Panel>

      <PublishedWorkshops
        items={items}
        upcomingTitle="Upcoming assignments"
        empty="No published workshop assignments yet."
        upcomingFooter={
          <HistoryPagination
            path="/pa"
            query={query}
            parameter="upcomingPage"
            page={upcomingPage}
            hasNext={upcomingRows.length > PAGE_SIZE}
            noun="assignments"
          />
        }
        historyFooter={
          <HistoryPagination
            path="/pa"
            query={query}
            parameter="historyPage"
            page={historyPage}
            hasNext={historyRows.length > PAGE_SIZE}
          />
        }
      />

      {replacementItems.length > 0 || changePage > 1 || replacementRows.length > PAGE_SIZE ? (
        <Panel
          title="Assignment changes"
          description="A record of published assignments added or removed by an admin."
        >
          <ul className="divide-y divide-slate-100">
            {replacementItems.map(({ event, after, removed }) => (
              <li key={event.id} className="flex gap-3 py-4 first:pt-0 last:pb-0">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                  <AlertTriangle className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">
                    {event.workshopSession.hostClassName ??
                      event.workshopSession.classWorkshop.classSection.name}
                    : {removed ? 'Your assignment was removed.' : 'You were assigned by an admin.'}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {formatInstantRange(new Date(after.start), new Date(after.end))}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Recorded {formatInstantRange(event.createdAt, event.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          {replacementItems.length === 0 && (
            <p className="text-sm text-slate-500">No assignment changes on this page.</p>
          )}
          <HistoryPagination
            path="/pa"
            query={query}
            parameter="changePage"
            page={changePage}
            hasNext={replacementRows.length > PAGE_SIZE}
            noun="changes"
          />
        </Panel>
      ) : null}
    </main>
  )
}
