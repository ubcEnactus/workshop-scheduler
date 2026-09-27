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
import { History } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { StatusBadge } from '@/components/ui/status-badge'
import { buttonClasses } from '@/components/ui/button'
import { generateCandidatesFromClassContext } from '@/lib/scheduling/recurring-candidates'
import { needsCommunication } from '@/lib/scheduling/communication'
import { markWorkshopCommunicated } from '../communication-actions'
import { SubmitButton } from '@/components/submit-button'
import { DraftOperationHistory } from '@/components/draft-operation-history'

function clock(date: Date) {
  const minute = vancouverMinuteOfDay(date)
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

export default async function WorkshopDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const actor = await requireRole('ADMIN')
  const { id } = await params
  const query = await searchParams
  const { error, saved } = query
  const workshop = await prisma.workshopSession.findFirst({
    where: {
      id,
    },
    include: {
      classWorkshop: {
        include: { workshopDefinition: true, classSection: { include: { school: true } } },
      },
      _count: { select: { assignments: true } },
      events: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!workshop) notFound()
  const draftOperations =
    workshop.status === 'DRAFT'
      ? await prisma.draftStaffingOperation.findMany({
          where: {
            actorId: actor.id,
            workshopDefinitionId: workshop.classWorkshop.workshopDefinitionId,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        })
      : []
  const classes = await prisma.classSection.findMany({
    where: {
      archivedAt: null,
      school: { deletedAt: null },
    },
    include: {
      school: { include: { closures: true } },
      availabilityExceptions: true,
      availabilitySlots: true,
      meetings: {
        include: { skips: true },
        orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
      },
      classWorkshops: {
        where: { workshopDefinitionId: workshop.classWorkshop.workshopDefinitionId },
        include: { availabilitySlots: { orderBy: { start: 'asc' } }, workshopDefinition: true },
      },
    },
    orderBy: { name: 'asc' },
  })
  const month = vancouverMonthKey(workshop.scheduledStart)
  const context = parseSchedulingContext(
    { ...query, workshopDefinitionId: workshop.classWorkshop.workshopDefinitionId },
    month
  )
  const snapshot = await loadSchedule(prisma, { kind: 'sessions', workshopSessionIds: [id] })
  const activeTeachers = await prisma.user.findMany({
    where: { deletedAt: null, role: 'TEACHER' },
    select: { id: true, schoolId: true },
  })
  const staffingWorkshop = snapshot.workshops.find((w) => w.id === id)
  return (
    <main className="page-content">
      <PageHeader
        eyebrow={`${workshop.hostClassName ?? workshop.classWorkshop.classSection.name} · ${workshop.hostSchoolName ?? workshop.classWorkshop.classSection.school.name}`}
        title={workshop.classWorkshop.workshopDefinition.title}
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
          ← Back to {workshop.classWorkshop.workshopDefinition.title} schedule
        </Link>
      </PageHeader>
      <FormError message={error} />
      <Link
        href={'/admin/class-workshops/' + workshop.classWorkshopId}
        className="text-sm underline"
      >
        Included teacher and availability
      </Link>
      <p className="text-sm break-words text-slate-600">
        {workshop.location}
      </p>
      {workshop.notes && (
        <p className="text-sm whitespace-pre-wrap text-slate-600">
          Internal admin notes: {workshop.notes}
        </p>
      )}
      {workshop.participantInstructions && (
        <p className="text-sm whitespace-pre-wrap text-slate-600">
          Participant instructions: {workshop.participantInstructions}
        </p>
      )}
      {saved === '1' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
          <p role="status" className="text-sm font-medium text-green-800">
            Draft saved.
          </p>
          {workshop.status === 'DRAFT' && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-green-900">
                The teacher session date is saved. Next, assign PAs and review publication.
              </p>
              <Link href="#workshop-staffing" className={buttonClasses({ size: 'sm' })}>
                Assign PAs to this teacher session
              </Link>
            </div>
          )}
        </div>
      )}
      {workshop.status === 'DRAFT' && workshop._count.assignments === 0 ? (
        <details className="rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold">Edit date and details</summary>
          <div className="mt-4">
            <WorkshopForm
              action={updateWorkshopForm}
              classes={classes.map((c) => ({
                ...c,
                candidates: c.classWorkshops.flatMap((cw) =>
                  generateCandidatesFromClassContext({
                    windowStart:
                      cw.workshopDefinition.deliveryStartsOn ??
                      vancouverDateKey(workshop.scheduledStart),
                    windowEnd:
                      cw.workshopDefinition.deliveryEndsOn ??
                      vancouverDateKey(workshop.scheduledStart),
                    durationMinutes:
                      (workshop.scheduledEnd.getTime() - workshop.scheduledStart.getTime()) / 60000,
                    meetings: c.meetings,
                    exceptions: c.availabilityExceptions,
                    schoolClosures: c.school.closures,
                    explicit: [...cw.availabilitySlots, ...c.availabilitySlots],
                    maxCandidates: 250,
                  })
                    .filter(() =>
                      activeTeachers.some(
                        (teacher) => teacher.id === c.teacherId && teacher.schoolId === c.schoolId
                      )
                    )
                    .map((slot) => ({
                      classWorkshopId: cw.id,
                      date: vancouverDateKey(slot.start),
                      startTime: clock(slot.start),
                      endTime: clock(slot.end),
                    }))
                ),
              }))}
              month={month}
              context={context}
              initial={{
                id,
                version: workshop.version,
                workshopDefinitionId: workshop.classWorkshop.workshopDefinitionId,
                classSectionId: workshop.classWorkshop.classSectionId,
                date: vancouverDateKey(workshop.scheduledStart),
                startTime: clock(workshop.scheduledStart),
                endTime: clock(workshop.scheduledEnd),
                minPAs: workshop.minPAs,
                maxPAs: workshop.maxPAs,
                hostingConfirmed: workshop.hostingConfirmed,
                mode: workshop.mode,
                location: workshop.location,
                notes: workshop.notes,
                participantInstructions: workshop.participantInstructions,
              }}
            />
          </div>
        </details>
      ) : null}
      {staffingWorkshop && (
        <div id="workshop-staffing" className="scroll-mt-6">
          <Panel>
            <WorkshopStaffing workshop={staffingWorkshop} snapshot={snapshot} context={context} />
            <DraftOperationHistory
              workshopDefinitionId={workshop.classWorkshop.workshopDefinitionId}
              items={draftOperations.map((item) => ({
                id: item.id,
                summary: item.summary,
                createdAt: item.createdAt.toISOString(),
                undoneAt: item.undoneAt?.toISOString() ?? null,
                canUndo: Array.isArray(item.changes) && item.changes.length > 0,
              }))}
            />
          </Panel>
        </div>
      )}
      {staffingWorkshop && (
        <Panel>
          <WorkshopChanges workshop={staffingWorkshop} snapshot={snapshot} context={context} />
        </Panel>
      )}
      <details
        id="history"
        open={
          query.communicated === '1' ||
          workshop.events.some((event) => needsCommunication(event) && !event.communicatedAt)
        }
        className="rounded-xl border border-slate-200 bg-white p-4"
      >
        <summary className="cursor-pointer text-sm font-semibold">
          History &amp; communication
        </summary>
        <div className="mt-4">
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
                  {needsCommunication(event) &&
                    (event.communicatedAt ? (
                      <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
                        <p>
                          Communication recorded{' '}
                          {formatInstantRange(event.communicatedAt, event.communicatedAt)}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap">{event.communicationNote}</p>
                      </div>
                    ) : (
                      <form
                        action={markWorkshopCommunicated}
                        className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4"
                      >
                        <input type="hidden" name="eventId" value={event.id} />
                        <p className="font-semibold text-amber-900">
                          Contact school and assigned PAs
                        </p>
                        <p className="text-sm text-amber-800">
                          Contact the teacher and affected PAs outside the app. No email has been
                          sent.
                        </p>
                        <label className="block text-sm">
                          Who was contacted?
                          <input
                            name="contacted"
                            required
                            maxLength={1000}
                            className="field-input mt-1"
                            placeholder="Teacher and PA names"
                          />
                        </label>
                        <label className="block text-sm">
                          Optional note
                          <textarea name="note" maxLength={2000} className="field-input mt-1" />
                        </label>
                        <SubmitButton>Record communication</SubmitButton>
                      </form>
                    ))}
                </article>
              ))}
            </div>
          )}
        </div>
      </details>
    </main>
  )
}
