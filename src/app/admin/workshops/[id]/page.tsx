import Link from 'next/link'
import { parseSchedulingContext, schedulingHref } from '@/lib/scheduling/navigation'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { FormError } from '@/components/form-error'
import { WorkshopForm } from '@/components/workshop-form'
import {
  formatInstantRange,
  vancouverDateKey,
  vancouverMinuteOfDay,
  vancouverMonthKey,
} from '@/lib/time'
import { updateWorkshopForm } from '../actions'
import { loadSchedule } from '@/lib/scheduling/store'
import { WorkshopStaffing } from '@/components/workshop-staffing'
import { WorkshopChanges } from '@/components/workshop-changes'
import { ChangeSummary } from '@/components/change-summary'
import { CalendarClock, History, MapPin, Users } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { StatCard } from '@/components/ui/stat-card'
import { StatusBadge } from '@/components/ui/status-badge'

function clock(date: Date) {
  const minute = vancouverMinuteOfDay(date)
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

function dateLabel(date: Date) {
  const [year, month, day] = vancouverDateKey(date).split('-').map(Number)
  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

export default async function WorkshopDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requireRole('ADMIN')
  const { id } = await params
  const query = await searchParams
  const { error, saved } = query
  const workshop = await prisma.workshop.findFirst({
    where: { id, classSection: { school: { deletedAt: null }, teacher: { deletedAt: null } } },
    include: {
      classSection: { include: { school: true } },
      _count: { select: { assignments: true } },
      events: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!workshop) notFound()
  const classes = await prisma.classSection.findMany({
    where: { school: { deletedAt: null }, teacher: { role: 'TEACHER', deletedAt: null } },
    include: {
      school: true,
      teacher: true,
      meetings: { orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] },
    },
    orderBy: { name: 'asc' },
  })
  const month = vancouverMonthKey(workshop.scheduledStart)
  const context = parseSchedulingContext(query, month)
  const snapshot = await loadSchedule(prisma)
  const staffingWorkshop = snapshot.workshops.find((w) => w.id === id)
  return (
    <main className="page-content">
      <PageHeader
        eyebrow={`${workshop.classSection.name} · ${workshop.classSection.school.name}`}
        title="Workshop details"
        description={
          <>
            <span>
              {formatInstantRange(workshop.scheduledStart, workshop.scheduledEnd)} ·
              America/Vancouver
            </span>
          </>
        }
        actions={
          <StatusBadge
            status={workshop.status}
            label={`Status: ${workshop.status.toLowerCase()}`}
          />
        }
      >
        <Link
          href={schedulingHref('/admin/workshops', context)}
          className="text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          ← Back to {context.month}
        </Link>
      </PageHeader>
      <FormError message={error} />
      {saved === '1' && (
        <p
          role="status"
          className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800"
        >
          Draft saved.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Date and time"
          value={dateLabel(workshop.scheduledStart)}
          detail={formatInstantRange(workshop.scheduledStart, workshop.scheduledEnd)}
          icon={<CalendarClock className="size-5" />}
          tone="blue"
        />
        <StatCard
          label="School"
          value={workshop.classSection.school.name}
          detail="Workshop location"
          icon={<MapPin className="size-5" />}
          tone="slate"
        />
        <StatCard
          label="Assigned PAs"
          value={workshop._count.assignments}
          detail={`${workshop.minPAs}–${workshop.maxPAs} needed`}
          icon={<Users className="size-5" />}
          tone={workshop._count.assignments < workshop.minPAs ? 'amber' : 'green'}
        />
      </div>
      {workshop.status === 'DRAFT' && workshop._count.assignments === 0 ? (
        <Panel
          title="Edit draft"
          description="Date, time, class, and staffing targets remain editable until the draft is staffed."
        >
          <WorkshopForm
            action={updateWorkshopForm}
            classes={classes
              .filter((c) => c.teacher.schoolId === c.schoolId)
              .map((c) => ({
                ...c,
                busy: snapshot.workshops
                  .filter(
                    (w) =>
                      w.id !== id &&
                      w.status !== 'CANCELLED' &&
                      classes.find((other) => other.id === w.classSectionId)?.teacherId ===
                        c.teacherId
                  )
                  .map((w) => ({
                    start: w.scheduledStart.toISOString(),
                    end: w.scheduledEnd.toISOString(),
                  })),
              }))}
            month={month}
            context={context}
            initial={{
              id,
              version: workshop.version,
              classSectionId: workshop.classSectionId,
              date: vancouverDateKey(workshop.scheduledStart),
              startTime: clock(workshop.scheduledStart),
              endTime: clock(workshop.scheduledEnd),
              minPAs: workshop.minPAs,
              maxPAs: workshop.maxPAs,
            }}
          />
        </Panel>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Only unstaffed draft workshops can be edited here.
        </div>
      )}
      {staffingWorkshop && (
        <Panel>
          <WorkshopStaffing workshop={staffingWorkshop} snapshot={snapshot} context={context} />
        </Panel>
      )}
      {staffingWorkshop && (
        <Panel>
          <WorkshopChanges workshop={staffingWorkshop} snapshot={snapshot} context={context} />
        </Panel>
      )}
      <Panel
        title="Workshop history"
        description="A durable record of applied schedule and staffing changes."
        actions={<History className="size-5 text-slate-400" />}
      >
        {workshop.events.length === 0 ? (
          <div className="empty-state">
            <History className="size-8 text-slate-300" /> No recorded changes.
          </div>
        ) : (
          <div className="space-y-4">
            {workshop.events.map((event) => (
              <article
                key={event.id}
                className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900 capitalize">
                      {event.kind.toLowerCase()}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {event.actorName} · {formatInstantRange(event.createdAt, event.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={event.kind} />
                </div>
                <p className="text-sm text-slate-600">{event.reason}</p>
                <ChangeSummary before={event.before} after={event.after} />
              </article>
            ))}
          </div>
        )}
      </Panel>
    </main>
  )
}
