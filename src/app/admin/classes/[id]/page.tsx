import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { FormError } from '@/components/form-error'
import { SubmitButton } from '@/components/submit-button'
import { buttonClasses } from '@/components/ui/button'
import { ClassCalendar } from '@/components/class-calendar'
import { CandidateBooking } from '@/components/candidate-booking'
import { formatInstantRange, vancouverDateKey, vancouverMinuteOfDay } from '@/lib/time'
import { addClassWorkshop } from '../../class-workshops/actions'
import { updateClassLifecycle } from '../actions'
import { runCoverageState, runCoverageStateLabel } from '@/lib/scheduling/class-workshops'
import { dateOnly, deliveryWindowLabel } from '@/lib/scheduling/delivery-windows'
import { generateCandidatesFromClassContext } from '@/lib/scheduling/recurring-candidates'
import { parseSchedulingContext, schedulingHref } from '@/lib/scheduling/navigation'

function clock(date: Date) {
  const n = vancouverMinuteOfDay(date)
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
}

export default async function ClassWorkshops({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requireRole('ADMIN')
  const { id } = await params
  const query = await searchParams
  const context = { ...parseSchedulingContext(query), classSectionId: id }
  const cls = await prisma.classSection.findFirst({
    where: { id, school: { deletedAt: null } },
    include: {
      school: { include: { closures: true } },
      teacher: true,
      meetings: {
        include: { skips: true },
        orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
      },
      availabilityExceptions: { orderBy: { date: 'asc' } },
      availabilitySlots: { orderBy: { start: 'asc' } },
      classWorkshops: {
        include: {
          workshopDefinition: true,
          availabilitySlots: true,
          sessions: {
            orderBy: { scheduledStart: 'desc' },
            include: { _count: { select: { assignments: true } } },
          },
        },
        orderBy: { workshopDefinition: { number: 'asc' } },
      },
    },
  })
  if (!cls) notFound()
  const [definitions, schoolTeachers] = await Promise.all([
    prisma.workshopDefinition.findMany({
      where: {
        identityStatus: 'IDENTIFIED',
        classWorkshops: { none: { classSectionId: id } },
      },
      orderBy: [{ deliveryStartsOn: 'desc' }, { title: 'asc' }],
    }),
    prisma.user.findMany({
      where: { role: 'TEACHER', deletedAt: null, schoolId: cls.schoolId },
      orderBy: { name: 'asc' },
    }),
  ])
  const tab = query.tab === 'workshops' ? 'workshops' : 'availability'
  const month = context.month
  const today = vancouverDateKey(new Date())
  const currentTeacherId = cls.teacherId
  const currentTeacher = schoolTeachers.find((teacher) => teacher.id === currentTeacherId)
  let initialDate = today.startsWith(month) ? today : month + '-01'
  while ([0, 6].includes(new Date(initialDate + 'T12:00:00Z').getUTCDay())) {
    const next = new Date(initialDate + 'T12:00:00Z')
    next.setUTCDate(next.getUTCDate() + 1)
    initialDate = next.toISOString().slice(0, 10)
  }
  if (!initialDate.startsWith(month)) initialDate = month + '-01'
  const sessions = cls.classWorkshops.flatMap((cw) =>
    cw.sessions
      .filter((s) => s.status !== 'CANCELLED')
      .map((s) => ({
        ...s,
        title:
          cw.workshopDefinition.identityStatus === 'NEEDS_IDENTIFICATION'
            ? 'Imported workshop'
            : cw.workshopDefinition.title,
      }))
  )
  const allSlots = [
    ...cls.availabilitySlots.map((s) => ({
      ...s,
      workshopId: undefined,
      workshopTitle: undefined,
    })),
    ...cls.classWorkshops.flatMap((cw) =>
      cw.availabilitySlots.map((s) => ({
        ...s,
        workshopId: cw.id,
        workshopTitle:
          cw.workshopDefinition.identityStatus === 'NEEDS_IDENTIFICATION'
            ? 'Imported workshop'
            : cw.workshopDefinition.title,
      }))
    ),
  ]
  return (
    <main className="page-content">
      <PageHeader
        eyebrow={cls.school.name}
        title={cls.name}
        description={
          currentTeacher
            ? `${currentTeacher.name ?? currentTeacher.email} · ${currentTeacher.email}`
            : 'Teacher contact needs review'
        }
        actions={<div className="flex flex-wrap items-center gap-2">
          <Link href={'/admin/teachers/' + cls.teacherId + '/edit'} className={buttonClasses({variant:'secondary',size:'sm'})}>Edit contact</Link>
          <Link href={schedulingHref(`/admin/classes/${id}/edit`,context)} className={buttonClasses({variant:'ghost',size:'sm'})}>Settings</Link>
          <form action={updateClassLifecycle}>
            {Object.entries(context).map(([key,value])=><input key={key} type="hidden" name={key} value={value} />)}
            <input type="hidden" name="id" value={cls.id} />
            <input type="hidden" name="action" value={cls.archivedAt ? 'REACTIVATE' : 'ARCHIVE'} />
            <input type="hidden" name="expectedUpdatedAt" value={cls.updatedAt.toISOString()} />
            <SubmitButton variant="ghost" size="sm">{cls.archivedAt ? 'Reactivate teacher' : 'Deactivate teacher'}</SubmitButton>
          </form>
          {context.workshopDefinitionId && <Link href={schedulingHref('/admin/workshops/plan',context)} className={buttonClasses({variant:'secondary',size:'sm'})}>Back to workshop planning</Link>}
        </div>}
      >
        <Link href={schedulingHref('/admin/classes', context)} className="text-sm underline">
          ← Teachers
        </Link>
      </PageHeader>
      <nav aria-label="Teacher sections" className="flex gap-2 rounded-xl border border-slate-200 bg-white p-2">
        {(['availability','workshops'] as const).map((section)=><Link key={section}
          href={schedulingHref(`/admin/classes/${id}`,context,{tab:section})}
          aria-current={tab === section ? 'page' : undefined}
          className={buttonClasses({variant:tab === section ? 'primary':'ghost',size:'sm'})}>
          {section === 'availability' ? 'Availability' : 'Workshops'}
        </Link>)}
      </nav>
      <FormError message={query.error} />
      {query.saved && (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          {query.saved === 'created'
            ? 'Teacher added.'
            : query.saved === 'details'
              ? 'Teacher details saved.'
              : query.saved === 'teacher'
                ? 'Teacher details saved.'
                : 'Teacher status updated.'}
        </p>
      )}
      {cls.archivedAt && (
        <div className="rounded-xl border border-slate-300 bg-slate-100 p-4">
          <p className="font-semibold">Inactive teacher</p>
          <p className="mt-1 text-sm text-slate-600">
            Historical workshops and sessions remain available. Reactivate the teacher before adding
            it to another workshop.
          </p>
        </div>
      )}
      {tab === 'availability' && <section id="availability" className="scroll-mt-6">
        <ClassCalendar
          key={month}
          classId={id}
          schoolId={cls.schoolId}
          editable={cls.archivedAt === null}
          month={month}
          initialDate={initialDate}
          availability={allSlots.map((s) => ({
            id: s.id,
            date: vancouverDateKey(s.start),
            startTime: clock(s.start),
            endTime: clock(s.end),
            endDate: vancouverDateKey(s.end),
            notes: s.notes,
            updatedAt: s.updatedAt.toISOString(),
            workshopId: s.workshopId,
            workshopTitle: s.workshopTitle,
            booked: sessions.some((b) => s.start <= b.scheduledStart && s.end >= b.scheduledEnd),
          }))}
          sessions={sessions.map((s) => ({
            id: s.id,
            date: vancouverDateKey(s.scheduledStart),
            time: `${clock(s.scheduledStart)}–${clock(s.scheduledEnd)}`,
            title: s.title,
            status: s.status,
          }))}
          windows={cls.classWorkshops.map((cw) => ({
            id: cw.id,
            title:
              cw.workshopDefinition.identityStatus === 'NEEDS_IDENTIFICATION'
                ? 'Imported workshop'
                : cw.workshopDefinition.title,
            start: dateOnly(cw.workshopDefinition.deliveryStartsOn),
            end: dateOnly(cw.workshopDefinition.deliveryEndsOn),
          }))}
          meetings={cls.meetings.map((meeting) => ({
            id: meeting.id,
            dayOfWeek: meeting.dayOfWeek,
            startMinute: meeting.startMinute,
            endMinute: meeting.endMinute,
            effectiveFrom: meeting.effectiveFrom.toISOString().slice(0, 10),
            effectiveUntil: meeting.effectiveUntil?.toISOString().slice(0, 10) ?? null,
            activeForScheduling: meeting.activeForScheduling,
            notes: meeting.notes,
            updatedAt: meeting.updatedAt.toISOString(),
            skips: meeting.skips.map((skip) => ({
              id: skip.id,
              date: skip.date.toISOString().slice(0, 10),
            })),
          }))}
          availabilityExceptions={cls.availabilityExceptions.map((exception) => ({
            id: exception.id,
            date: exception.date.toISOString().slice(0, 10),
            kind: exception.kind,
            startMinute: exception.startMinute,
            endMinute: exception.endMinute,
            notes: exception.notes,
            updatedAt: exception.updatedAt.toISOString(),
          }))}
          schoolClosures={cls.school.closures.map((closure) => ({
            id: closure.id,
            date: closure.date.toISOString().slice(0, 10),
            startMinute: closure.startMinute,
            endMinute: closure.endMinute,
            notes: closure.notes,
            updatedAt: closure.updatedAt.toISOString(),
          }))}
          navigationContext={context}
        />
      </section>
      }
      {tab === 'workshops' && <section id="workshops" className="scroll-mt-6">
        <Panel
          title="Workshops for this teacher"
        >
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              {cls.classWorkshops.length} workshop{cls.classWorkshops.length === 1 ? '' : 's'} for
              this teacher
            </p>
            <Link href="/admin/workshop-definitions" className="text-sm font-medium underline">
              Manage workshops
            </Link>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {cls.classWorkshops.map((cw) => {
              const definition = cw.workshopDefinition
              const session = cw.sessions.find((s) => s.status !== 'CANCELLED')
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
                      explicit: [...cw.availabilitySlots, ...cls.availabilitySlots],
                    }).filter(() => schoolTeachers.some((teacher) => teacher.id === cls.teacherId))
                  : []
              const explicitGenerated =
                definition.deliveryStartsOn && definition.deliveryEndsOn
                  ? generateCandidatesFromClassContext({
                      windowStart: definition.deliveryStartsOn,
                      windowEnd: definition.deliveryEndsOn,
                      durationMinutes,
                      meetings: [],
                      exceptions: cls.availabilityExceptions.filter(
                        (exception) => exception.kind === 'CLOSED'
                      ),
                      schoolClosures: cls.school.closures,
                      explicit: [...cw.availabilitySlots, ...cls.availabilitySlots],
                    }).filter(
                      (candidate) =>
                        candidate.authorization.kind === 'EXPLICIT' &&
                        schoolTeachers.some((teacher) => teacher.id === cls.teacherId)
                    )
                  : []
              const explicitCandidatesBySlot = new Map<string, (typeof explicitGenerated)[number]>()
              for (const candidate of explicitGenerated)
                if (!explicitCandidatesBySlot.has(candidate.authorization.id))
                  explicitCandidatesBySlot.set(candidate.authorization.id, candidate)
              const explicitCandidates = [...explicitCandidatesBySlot.values()]
              const explicitSlots = new Map(
                [...cw.availabilitySlots, ...cls.availabilitySlots].map((slot) => [slot.id, slot])
              )
              const hasRecurringCandidate = candidates.some(
                (candidate) => candidate.authorization.kind !== 'EXPLICIT'
              )
              const windowEnded =
                definition.deliveryEndsOn !== null && dateOnly(definition.deliveryEndsOn) < today
              const coverageState = runCoverageState({
                status: cw.status,
                availabilityCount: candidates.length,
                windowEnded,
                sessions: cw.sessions.map((item) => ({
                  status: item.status,
                  minPAs: item.minPAs,
                  assignmentCount: item._count.assignments,
                })),
              })
              const statusLabel = runCoverageStateLabel(coverageState)
              const canSchedule =
                !cls.archivedAt && !session && cw.status !== 'WAIVED' && !windowEnded
              return (
                <article
                  key={cw.id}
                  className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold tracking-wide text-slate-500">
                        {definition.number
                          ? `WORKSHOP ${definition.number}`
                          : definition.identityStatus === 'NEEDS_IDENTIFICATION'
                            ? 'LEGACY IDENTITY NEEDED'
                            : 'WORKSHOP'}
                      </p>
                      <h2 className="mt-1 font-semibold">
                        {definition.identityStatus === 'NEEDS_IDENTIFICATION'
                          ? 'Identify imported workshop'
                          : definition.title}
                      </h2>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${coverageState === 'READY_TO_SCHEDULE' || coverageState === 'READY_TO_PUBLISH' ? 'bg-emerald-50 text-emerald-800' : coverageState === 'NEEDS_PAS' || coverageState === 'WINDOW_ENDED_OUTSTANDING' ? 'bg-amber-50 text-amber-900' : coverageState === 'PUBLISHED' || coverageState === 'COMPLETED' ? 'bg-blue-50 text-blue-800' : 'bg-slate-100 text-slate-600'}`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">
                    {deliveryWindowLabel(definition)}
                    {definition.durationMinutes ? ` · ${definition.durationMinutes} min` : ''}
                  </p>
                  {session ? (
                    <Link
                      href={'/admin/workshops/' + session.id}
                      className="block text-sm font-medium underline"
                    >
                      {formatInstantRange(session.scheduledStart, session.scheduledEnd)} · Manage
                      session
                    </Link>
                  ) : canSchedule && (explicitCandidates.length || hasRecurringCandidate) ? (
                    <>
                      {explicitCandidates.length > 0 && (
                        <details>
                          <summary className="cursor-pointer text-sm font-semibold text-blue-800">
                            Choose from {explicitCandidates.length} saved candidate time
                            {explicitCandidates.length === 1 ? '' : 's'}
                          </summary>
                          <CandidateBooking
                            classWorkshopId={cw.id}
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
                        </details>
                      )}
                      {hasRecurringCandidate && (
                        <Link
                          className="block text-sm font-semibold underline"
                          href={schedulingHref('/admin/workshops/plan', {
                            ...context,
                            workshopDefinitionId: definition.id,
                            classSectionId: cls.id,
                          })}
                        >
                          Choose a recurring time in the workshop planner
                        </Link>
                      )}
                    </>
                  ) : cls.archivedAt ? (
                    <p className="text-sm text-slate-600">
                      Reactivate this teacher before scheduling another session.
                    </p>
                  ) : cw.status === 'WAIVED' ? (
                    <p className="text-sm text-slate-600">
                      Delivery is marked not required for this workshop.
                    </p>
                  ) : windowEnded ? (
                    <p className="text-sm text-amber-800">
                      The delivery window ended without a session.
                    </p>
                  ) : (
                    <p className="text-sm text-slate-600">
                      Add teacher availability
                      {definition.deliveryStartsOn
                        ? ' inside this delivery window'
                        : ' in the calendar'}{' '}
                      to choose a session time.
                    </p>
                  )}
                  <Link
                    href={'/admin/class-workshops/' + cw.id}
                    className="inline-block text-xs text-slate-600 underline"
                  >
                    {definition.identityStatus === 'NEEDS_IDENTIFICATION'
                      ? 'Identify workshop'
                      : 'Workshop details & history'}
                  </Link>
                </article>
              )
            })}
          </div>
          {!cls.archivedAt && definitions.length > 0 ? (
            <form
              action={addClassWorkshop}
              className="mt-5 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-5"
            >
              <input type="hidden" name="classSectionId" value={id} />
              <input type="hidden" name="returnToClass" value="1" />
              <input type="hidden" name="returnMonth" value={month} />
              {context.workshopDefinitionId && (
                <input
                  type="hidden"
                  name="returnWorkshopDefinitionId"
                  value={context.workshopDefinitionId}
                />
              )}
              {context.week && <input type="hidden" name="returnWeek" value={context.week} />}
              <label className="field min-w-0 flex-1">
                Workshop
                <select
                  aria-label="Workshop"
                  name="workshopDefinitionId"
                  className="input"
                  required
                >
                  {definitions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.number ? `${d.number}. ` : ''}
                      {d.title} · {deliveryWindowLabel(d)}
                    </option>
                  ))}
                </select>
              </label>
              <SubmitButton>Add workshop to teacher</SubmitButton>
            </form>
          ) : (
            !cls.archivedAt &&
            !cls.classWorkshops.length && (
              <p className="text-sm text-slate-600">
                Create a workshop, then add it to this teacher.
              </p>
            )
          )}
        </Panel>
      </section>
      }
    </main>
  )
}
