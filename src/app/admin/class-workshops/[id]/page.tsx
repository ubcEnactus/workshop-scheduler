import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { FormError } from '@/components/form-error'
import { SubmitButton } from '@/components/submit-button'
import { buttonClasses } from '@/components/ui/button'
import { formatInstantRange, vancouverDateKey, vancouverMinuteOfDay } from '@/lib/time'
import { runCoverageState, runCoverageStateLabel } from '@/lib/scheduling/class-workshops'
import { dateOnly, deliveryWindowLabel } from '@/lib/scheduling/delivery-windows'
import { generateCandidatesFromClassContext } from '@/lib/scheduling/recurring-candidates'
import { CandidateBooking } from '@/components/candidate-booking'
import {
  saveAvailabilitySlot,
  removeAvailabilitySlot,
  scheduleCandidate,
  identifyImportedWorkshop,
} from '../actions'
import { workshopRecordReference } from '../../workshop-definitions/workshop-reference'

function clock(date: Date) {
  const n = vancouverMinuteOfDay(date)
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
}
function TimeFields({ start, end }: { start?: Date; end?: Date }) {
  return (
    <div className="form-grid">
      <label className="field">
        Date
        <input
          className="input"
          type="date"
          name="date"
          required
          defaultValue={start && vancouverDateKey(start)}
        />
      </label>
      <label className="field">
        Start time
        <input
          className="input"
          type="time"
          name="startTime"
          step={900}
          required
          defaultValue={start && clock(start)}
        />
      </label>
      <label className="field">
        End time
        <input
          className="input"
          type="time"
          name="endTime"
          step={900}
          required
          defaultValue={end && clock(end)}
        />
      </label>
    </div>
  )
}
export default async function ClassWorkshopDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requireRole('ADMIN')
  const { id } = await params
  const query = await searchParams
  const record = await prisma.classWorkshop.findFirst({
    where: {
      id,
      classSection: { school: { deletedAt: null } },
    },
    include: {
      classSection: {
        include: {
          school: { include: { closures: true } },
          teacher: true,
          meetings: { include: { skips: true } },
          availabilityExceptions: true,
          availabilitySlots: { orderBy: { start: 'asc' } },
        },
      },
      workshopDefinition: true,
      availabilitySlots: { orderBy: { start: 'asc' } },
      sessions: {
        orderBy: { createdAt: 'desc' },
        include: {
          assignments: { where: { pa: { deletedAt: null } }, include: { pa: true } },
          _count: { select: { assignments: true } },
        },
      },
    },
  })
  if (!record) notFound()
  const active = record.sessions.find((s) => s.status !== 'CANCELLED')
  const definition = record.workshopDefinition
  const cls = record.classSection
  const [definitions, activeSchoolTeachers] = await Promise.all([
    definition.identityStatus === 'NEEDS_IDENTIFICATION'
      ? prisma.workshopDefinition.findMany({
          where: {
            identityStatus: 'IDENTIFIED',
            classWorkshops: { none: { classSectionId: record.classSectionId } },
          },
          orderBy: [{ deliveryStartsOn: 'desc' }, { title: 'asc' }],
        })
      : Promise.resolve([]),
    prisma.user.findMany({
      where: { role: 'TEACHER', deletedAt: null, schoolId: cls.schoolId },
      select: { id: true },
    }),
  ])
  const durationMinutes = definition.durationMinutes ?? cls.defaultDurationMinutes
  const candidates =
    definition.deliveryStartsOn && definition.deliveryEndsOn
      ? generateCandidatesFromClassContext({
          windowStart: definition.deliveryStartsOn,
          windowEnd: definition.deliveryEndsOn,
          durationMinutes,
          meetings: cls.meetings,
          exceptions: cls.availabilityExceptions,
          schoolClosures: cls.school.closures,
          explicit: [...record.availabilitySlots, ...cls.availabilitySlots],
        }).filter(() => activeSchoolTeachers.some((teacher) => teacher.id === cls.teacherId))
      : []
  const explicitGenerated =
    definition.deliveryStartsOn && definition.deliveryEndsOn
      ? generateCandidatesFromClassContext({
          windowStart: definition.deliveryStartsOn,
          windowEnd: definition.deliveryEndsOn,
          durationMinutes,
          meetings: [],
          exceptions: cls.availabilityExceptions.filter((exception) => exception.kind === 'CLOSED'),
          schoolClosures: cls.school.closures,
          explicit: [...record.availabilitySlots, ...cls.availabilitySlots],
        }).filter(
          (candidate) =>
            candidate.authorization.kind === 'EXPLICIT' &&
            activeSchoolTeachers.some((teacher) => teacher.id === cls.teacherId)
        )
      : []
  const explicitCandidatesBySlot = new Map<string, (typeof explicitGenerated)[number]>()
  for (const candidate of explicitGenerated)
    if (!explicitCandidatesBySlot.has(candidate.authorization.id))
      explicitCandidatesBySlot.set(candidate.authorization.id, candidate)
  const explicitCandidates = [...explicitCandidatesBySlot.values()]
  const explicitSlots = new Map(
    [...record.availabilitySlots, ...cls.availabilitySlots].map((slot) => [slot.id, slot])
  )
  const hasRecurringCandidate = candidates.some(
    (candidate) => candidate.authorization.kind !== 'EXPLICIT'
  )
  const today = vancouverDateKey(new Date())
  const workflowWeek =
    definition.deliveryStartsOn && definition.deliveryEndsOn
      ? today >= dateOnly(definition.deliveryStartsOn) &&
        today <= dateOnly(definition.deliveryEndsOn)
        ? today
        : dateOnly(definition.deliveryStartsOn)
      : today
  const windowEnded =
    definition.deliveryEndsOn !== null && dateOnly(definition.deliveryEndsOn) < today
  const coverageState = runCoverageState({
    status: record.status,
    availabilityCount: candidates.length,
    windowEnded,
    sessions: record.sessions.map((session) => ({
      status: session.status,
      minPAs: session.minPAs,
      assignmentCount: session._count.assignments,
    })),
  })
  const statusLabel = runCoverageStateLabel(coverageState)
  const mutable = cls.archivedAt === null && record.status !== 'WAIVED'
  const canSchedule = mutable && !active && !windowEnded
  return (
    <main className="page-content">
      <PageHeader
        eyebrow={`${record.classSection.school.name} · ${record.classSection.name}`}
        title={record.workshopDefinition.title}
        description={statusLabel}
      >
        <Link
          href={`/admin/classes/${record.classSectionId}?classSectionId=${record.classSectionId}&workshopDefinitionId=${record.workshopDefinitionId}&week=${workflowWeek}`}
          className="text-sm underline"
        >
          ← Workshops for this teacher
        </Link>
      </PageHeader>
      <FormError message={query.error} />
      <Panel title="Teacher calendar" description={deliveryWindowLabel(record.workshopDefinition)}>
        <Link
          className="text-sm underline"
          href={`/admin/classes/${record.classSectionId}?classSectionId=${record.classSectionId}&workshopDefinitionId=${record.workshopDefinitionId}&week=${workflowWeek}`}
        >
          Open teacher calendar{mutable ? ' to add availability' : ''}
        </Link>
        {canSchedule && explicitCandidates.length > 0 && (
          <CandidateBooking
            classWorkshopId={id}
            candidates={explicitCandidates.flatMap((candidate) => {
              const slot = explicitSlots.get(candidate.authorization.id)
              return slot
                ? [
                    {
                      id: slot.id,
                      label: formatInstantRange(candidate.start, candidate.end),
                      startTime: clock(candidate.start),
                      endTime: clock(candidate.end),
                      updatedAt: slot.updatedAt.toISOString(),
                    },
                  ]
                : []
            })}
          />
        )}
        {canSchedule && hasRecurringCandidate && (
          <p className="mt-4 text-sm">
            Recurring teacher availability has valid choices in this workshop.{' '}
            <Link
              className="font-semibold underline"
              href={`/admin/workshops/plan?workshopDefinitionId=${definition.id}&classSectionId=${cls.id}`}
            >
              Choose a teacher date
            </Link>
          </p>
        )}
        {canSchedule && candidates.length === 0 && (
          <p className="mt-4 text-sm text-slate-600">
            No valid session time is currently available inside this delivery window.
          </p>
        )}
        {!mutable && !active && (
          <p className="mt-4 text-sm text-slate-600">
            {cls.archivedAt
              ? 'Reactivate this teacher before scheduling another session.'
              : 'Delivery is not required for this workshop.'}
          </p>
        )}
      </Panel>
      {mutable && record.workshopDefinition.identityStatus === 'NEEDS_IDENTIFICATION' && (
        <Panel
          title="Identify this imported workshop"
          description="The original booking did not record its workshop identity. Choosing a workshop preserves this session, its assignments, dates, and history."
        >
          {definitions.length ? (
            <form action={identifyImportedWorkshop} className="max-w-xl space-y-4">
              <input type="hidden" name="classWorkshopId" value={id} />
              <input
                type="hidden"
                name="expectedUpdatedAt"
                value={record.updatedAt.toISOString()}
              />
              <label className="field">
                Workshop
                <select name="workshopDefinitionId" className="input" required>
                  {definitions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title} · {deliveryWindowLabel(d)} · Record {workshopRecordReference(d.id)}
                    </option>
                  ))}
                </select>
              </label>
              <SubmitButton>Identify workshop</SubmitButton>
            </form>
          ) : (
            <Link
              className="text-sm underline"
              href="/admin/workshop-definitions?create=1#create-workshop"
            >
              Create a workshop that is not already included for this teacher
            </Link>
          )}
        </Panel>
      )}
      {record.notes && <p className="text-sm text-slate-600">{record.notes}</p>}
      {record.sessions.length > 0 && (
        <Panel title="Sessions">
          <ul className="space-y-3">
            {record.sessions.map((s) => (
              <li key={s.id} className="space-y-1">
                <Link className="font-medium underline" href={'/admin/workshops/' + s.id}>
                  {formatInstantRange(s.scheduledStart, s.scheduledEnd)}
                </Link>
                <p className="text-sm text-slate-600">
                  {s.status.toLowerCase()}
                  {s.location ? ` · ${s.location}` : ''}
                </p>
                <p className="text-sm text-slate-600">
                  {s.assignments
                    .filter((a) => a.pa.deletedAt === null)
                    .map((a) => a.pa.name ?? a.pa.email)
                    .join(', ') || 'No PAs assigned'}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Panel
        title="Available times"
        description="Previously recorded workshop-specific candidates remain here. Use the teacher calendar for availability shared across workshops. All times are America/Vancouver."
      >
        {!record.availabilitySlots.length && (
          <p className="text-sm text-slate-600">No candidate times recorded yet.</p>
        )}
        <div className="space-y-4">
          {record.availabilitySlots.map((slot) => {
            const supportsSession =
              active && slot.start <= active.scheduledStart && slot.end >= active.scheduledEnd
            const schedulableCandidate = explicitCandidates.find(
              (candidate) => candidate.authorization.id === slot.id
            )
            return (
              <article key={slot.id} className="space-y-3 rounded-xl border border-slate-200 p-4">
                <h2 className="font-semibold">{formatInstantRange(slot.start, slot.end)}</h2>
                {slot.notes && <p className="text-sm text-slate-600">{slot.notes}</p>}
                {canSchedule && schedulableCandidate && (
                  <details>
                    <summary className="cursor-pointer font-medium">Schedule this time</summary>
                    <form action={scheduleCandidate} className="mt-4 space-y-4">
                      <input type="hidden" name="classWorkshopId" value={id} />
                      <input type="hidden" name="slotId" value={slot.id} />
                      <input
                        type="hidden"
                        name="expectedUpdatedAt"
                        value={slot.updatedAt.toISOString()}
                      />
                      <div className="form-grid">
                        <label className="field">
                          Session start
                          <input
                            className="input"
                            type="time"
                            name="startTime"
                            step={900}
                            required
                            defaultValue={clock(schedulableCandidate.start)}
                          />
                        </label>
                        <label className="field">
                          Session end
                          <input
                            className="input"
                            type="time"
                            name="endTime"
                            step={900}
                            required
                            defaultValue={clock(schedulableCandidate.end)}
                          />
                        </label>
                        <input type="hidden" name="mode" value="IN_PERSON" />
                      </div>
                      <label className="field">
                        Location
                        <input className="input" name="location" maxLength={500} />
                      </label>
                      <label className="field">
                        Session notes
                        <textarea className="input" name="notes" maxLength={2000} />
                      </label>
                      <SubmitButton>Create draft session</SubmitButton>
                    </form>
                  </details>
                )}
                {supportsSession ? (
                  <p className="text-xs text-slate-500">
                    This window supports the booked session. Manage date changes from the session.
                  </p>
                ) : mutable ? (
                  <>
                    <details>
                      <summary className="cursor-pointer text-sm">Edit availability</summary>
                      <form action={saveAvailabilitySlot} className="mt-4 space-y-4">
                        <input type="hidden" name="classWorkshopId" value={id} />
                        <input type="hidden" name="id" value={slot.id} />
                        <input
                          type="hidden"
                          name="expectedUpdatedAt"
                          value={slot.updatedAt.toISOString()}
                        />
                        <TimeFields start={slot.start} end={slot.end} />
                        <label className="field">
                          Notes
                          <textarea
                            className="input"
                            name="notes"
                            maxLength={2000}
                            defaultValue={slot.notes ?? ''}
                          />
                        </label>
                        <SubmitButton>Save availability</SubmitButton>
                      </form>
                    </details>
                    <form action={removeAvailabilitySlot}>
                      <input type="hidden" name="classWorkshopId" value={id} />
                      <input type="hidden" name="id" value={slot.id} />
                      <input
                        type="hidden"
                        name="expectedUpdatedAt"
                        value={slot.updatedAt.toISOString()}
                      />
                      <SubmitButton variant="danger" size="sm">
                        Remove availability
                      </SubmitButton>
                    </form>
                  </>
                ) : null}
              </article>
            )
          })}
        </div>
      </Panel>
      {mutable && (
        <Panel title="Add availability">
          <p className="mb-4 text-sm text-slate-600">
            This adds a candidate for this workshop only. For general teacher availability, use the
            teacher calendar.
          </p>
          <form action={saveAvailabilitySlot} className="max-w-2xl space-y-4">
            <input type="hidden" name="classWorkshopId" value={id} />
            <TimeFields />
            <label className="field">
              Notes
              <textarea className="input" name="notes" maxLength={2000} />
            </label>
            <SubmitButton>Add availability</SubmitButton>
          </form>
        </Panel>
      )}
      {active && (
        <Link
          className={buttonClasses({ variant: 'secondary' })}
          href={'/admin/workshops/' + active.id}
        >
          Manage session and assignments
        </Link>
      )}
    </main>
  )
}
