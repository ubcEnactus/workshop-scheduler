import { randomUUID } from 'node:crypto'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { runWorkspaceInclude } from '@/lib/scheduling/run-workspace'
import { loadSchedule } from '@/lib/scheduling/store'
import { scheduleHash } from '@/lib/scheduling/matching-preview'
import { workshopWorkspaceRows } from '@/lib/scheduling/workspace-view'
import { deliveryWindowLabel, dateOnly } from '@/lib/scheduling/delivery-windows'
import { generateCandidatesFromClassContext } from '@/lib/scheduling/recurring-candidates'
import { isCalendarDate, vancouverDateKey } from '@/lib/time'
import {
  WorkshopDraftWorkspace,
  WorkshopWorkspaceShell,
  type WorkshopStep,
} from '@/components/workshop-workspace'
import { WorkshopPlanContent } from '@/components/workshop-plan-content'
import { ClearSavedPlanningChoices } from '@/components/clear-saved-planning-choices'
import { FormError } from '@/components/form-error'
import { SubmitButton } from '@/components/submit-button'
import { PageHeader } from '@/components/ui/page-header'
import { buttonClasses } from '@/components/ui/button'
import { ClassPicker } from '../../class-workshops/class-picker'
import { EnrollmentForm } from '../../class-workshops/enrollment-form'
import { updateClassWorkshopLifecycle } from '../../class-workshops/actions'
import { workshopRecordReference } from '../workshop-reference'

export default async function WorkshopRunDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const actor = await requireRole('ADMIN')
  const [{ id }, rawQuery] = await Promise.all([params, searchParams])
  const query: Record<string, string | undefined> = Object.fromEntries(
    Object.entries(rawQuery).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])
  )
  const requestedSessionIds = [
    ...new Set(
      Array.isArray(rawQuery.sessionId)
        ? rawQuery.sessionId
        : rawQuery.sessionId
          ? [rawQuery.sessionId]
          : []
    ),
  ]
  const [run, schools, activeTeachers, snapshot, exclusions, operations] = await Promise.all([
    prisma.workshopDefinition.findUnique({
      where: { id },
      include: runWorkspaceInclude,
    }),
    prisma.school.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: {
        classSections: {
          where: { archivedAt: null },
          orderBy: { name: 'asc' },
          include: { teacher: true },
        },
      },
    }),
    prisma.user.findMany({
      where: { role: 'TEACHER', deletedAt: null },
      select: { id: true, name: true, email: true, schoolId: true },
    }),
    loadSchedule(prisma, { kind: 'run', workshopDefinitionId: id }),
    prisma.autoFillExclusion.findMany({
      where: { workshopSession: { classWorkshop: { workshopDefinitionId: id } } },
      select: { workshopSessionId: true, paId: true },
    }),
    prisma.draftStaffingOperation.findMany({
      where: { workshopDefinitionId: id, actorId: actor.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ])
  if (!run) notFound()
  const today = vancouverDateKey(new Date())
  const workflowWeek =
    query.week && isCalendarDate(query.week)
      ? query.week
      : run.deliveryStartsOn
        ? dateOnly(run.deliveryStartsOn)
        : today
  const windowEnded = !!run.deliveryEndsOn && dateOnly(run.deliveryEndsOn) < today
  const rows = workshopWorkspaceRows(
    snapshot,
    id,
    run.classWorkshops.map(({ classSection }) => ({
      id: classSection.id,
      name: classSection.name,
      schoolName: classSection.school.name,
    })),
    exclusions
  )
  const planningClasses = run.classWorkshops
    .map((enrollment) => {
      const cls = enrollment.classSection
      const active = enrollment.sessions.find((session) => session.status !== 'CANCELLED')
      const availableTeacher = () =>
        activeTeachers.find(
          (teacher) => teacher.id === cls.teacherId && teacher.schoolId === cls.schoolId
        )
      const firstCandidate =
        !active &&
        !cls.archivedAt &&
        !cls.school.deletedAt &&
        run.deliveryStartsOn &&
        run.deliveryEndsOn
          ? generateCandidatesFromClassContext({
              windowStart: run.deliveryStartsOn,
              windowEnd: run.deliveryEndsOn,
              durationMinutes: run.durationMinutes ?? cls.defaultDurationMinutes,
              meetings: cls.meetings,
              exceptions: cls.availabilityExceptions,
              schoolClosures: cls.school.closures,
              explicit: [...enrollment.availabilitySlots, ...cls.availabilitySlots],
            }).find(() => availableTeacher())
          : undefined
      const dateContext = active
        ? vancouverDateKey(active.scheduledStart)
        : (firstCandidate?.date ?? workflowWeek)
      return {
        enrollment,
        active,
        firstCandidate,
        dateContext,
        teacher: availableTeacher(),
      }
    })
    .sort((a, b) => {
      const priority = (item: typeof a) =>
        item.active ? 2 : item.firstCandidate && !windowEnded ? 0 : 1
      return (
        priority(a) - priority(b) ||
        a.enrollment.classSection.name.localeCompare(b.enrollment.classSection.name)
      )
    })
  const drafts = rows.filter((row) => row.status === 'DRAFT')
  const ready = drafts.filter((row) => !row.problems.length)
  const needPAs = drafts.filter((row) => row.assignments.length < row.minPAs)
  const unscheduled = run.classWorkshops.filter(
    (enrollment) =>
      enrollment.status !== 'WAIVED' &&
      !enrollment.sessions.some((session) => session.status !== 'CANCELLED')
  )
  const published = rows.filter((row) => row.status === 'PUBLISHED')
  const history = rows.filter((row) => row.status === 'COMPLETED' || row.status === 'CANCELLED')
  const step: WorkshopStep =
    query.step === 'plan' || query.step === 'staff' || query.step === 'publish'
      ? query.step
      : query.addClasses || query.saved !== undefined || (query.created === '1' && !query.batch)
        ? 'plan'
        : ready.length
          ? 'publish'
          : drafts.length
            ? 'staff'
            : 'plan'
  const href = (next: WorkshopStep, extra: Record<string, string | undefined> = {}) => {
    const values = {
      step: next,
      week: query.week,
      classSectionId: query.classSectionId,
      sessionId: query.sessionId,
      batch: query.batch,
      filter: next === step ? query.filter : undefined,
      ...extra,
    }
    const params = new URLSearchParams(
      Object.entries(values).filter((item): item is [string, string] => item[1] !== undefined)
    )
    if (!Object.hasOwn(extra, 'sessionId')) {
      params.delete('sessionId')
      for (const sessionId of requestedSessionIds) params.append('sessionId', sessionId)
    }
    return `/admin/workshop-definitions/${id}?${params}`
  }
  const batchIds = query.batch
    ? new Set(
        run.classWorkshops.flatMap((enrollment) =>
          enrollment.sessions
            .filter((session) => session.batchId === query.batch)
            .map((session) => session.id)
        )
      )
    : null
  const scopedRows = rows.filter(
    (row) =>
      (!batchIds || batchIds.has(row.id)) &&
      (!query.classSectionId || row.classSectionId === query.classSectionId) &&
      (!requestedSessionIds.length || requestedSessionIds.includes(row.id))
  )
  const scoped = Boolean(query.batch || query.classSectionId || query.sessionId || query.filter)
  const resetScope = {
    batch: undefined,
    classSectionId: undefined,
    sessionId: undefined,
    filter: undefined,
  }
  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Workshop"
        title={run.title}
        description={`${deliveryWindowLabel(run)} · ${run.classWorkshops.length} included teachers`}
        actions={
          <>
            <Link
              href="/admin/workshop-definitions"
              className={buttonClasses({ variant: 'ghost' })}
            >
              ← All workshops
            </Link>
            <details className="relative">
              <summary className="cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold">
                Workshop options
              </summary>
              <div className="absolute right-0 z-10 mt-2 min-w-48 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
                <p className="mb-3 text-xs text-slate-500">Record {workshopRecordReference(id)}</p>
                <Link
                  href={`/admin/workshop-definitions/${id}/delete`}
                  className="text-sm text-red-800 underline"
                >
                  Delete workshop
                </Link>
              </div>
            </details>
          </>
        }
      />
      <FormError message={query.error} />
      {query.created === '1' && !query.batch && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          Workshop created. Add the teachers that should receive it.
        </p>
      )}
      {query.saved !== undefined && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          Teachers added. {query.saved} new teacher{query.saved === '1' ? '' : 's'} included;
          teachers already in this workshop were unchanged.
        </p>
      )}
      {query.created && query.batch && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          {batchIds?.size ?? 0} teacher session{batchIds?.size === 1 ? '' : 's'} saved to the
          private draft. Add PAs below.
        </p>
      )}
      {query.created && query.batch && (
        <ClearSavedPlanningChoices
          storageKey={`workshop-planning:${actor.id}:${id}`}
          savedChoices={run.classWorkshops.flatMap((enrollment) =>
            enrollment.sessions
              .filter(
                (session) => session.batchId === query.batch && session.status !== 'CANCELLED'
              )
              .map((session) => ({
                classWorkshopId: enrollment.id,
                date: vancouverDateKey(session.scheduledStart),
                startTime: session.scheduledStart.toLocaleTimeString('en-GB', {
                  timeZone: 'America/Vancouver',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                }),
              }))
          )}
        />
      )}
      <WorkshopWorkspaceShell
        step={step}
        hrefs={{ plan: href('plan'), staff: href('staff'), publish: href('publish') }}
        summary={[
          { label: `${unscheduled.length} need dates`, href: href('plan', resetScope) },
          {
            label: `${needPAs.length} need PAs`,
            href: href('staff', { ...resetScope, filter: 'needs-pas' }),
          },
          {
            label: `${ready.length} ready to publish`,
            href: href('publish', { ...resetScope, filter: 'ready' }),
          },
        ]}
      >
        {step === 'plan' ? (
          <>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">Choose a date and time for each teacher</h2>
                <Link
                  href={href('plan', { addClasses: '1' }) + '#add-classes'}
                  className={buttonClasses({ variant: 'secondary', size: 'sm' })}
                >
                  Add teachers
                </Link>
              </div>
              <p className="text-sm text-slate-600">
                The delivery window is the overall date range—not a booking. Pick one date and time
                per teacher; you can save some now and finish the rest later.
              </p>
            </div>
            {windowEnded && unscheduled.length > 0 && (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
                The delivery window has ended. {unscheduled.length} class
                {unscheduled.length === 1 ? '' : 'es'} still need a delivery decision.
              </p>
            )}
            <div id="class-dates">
              <WorkshopPlanContent
                run={run}
                snapshot={snapshot}
                activeTeachers={activeTeachers}
                query={query}
                selectedSessionIds={requestedSessionIds}
              />
            </div>
            <details
              id="add-classes"
              open={!run.classWorkshops.length || query.addClasses === '1'}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <summary className="cursor-pointer font-semibold">Add teachers</summary>
              <div className="mt-4">
                <p className="mb-3 text-sm text-slate-600">
                  Adding a teacher does not create a date or PA assignment.
                </p>
                <EnrollmentForm workshopId={id} submitLabel="Add selected teachers">
                  <input type="hidden" name="runIds" value={id} />
                  <input type="hidden" name="requestKey" value={randomUUID()} />
                  <ClassPicker
                    schools={schools.map((school) => ({
                      id: school.id,
                      name: school.name,
                      classes: school.classSections
                        .map((cls) => ({
                          cls,
                          teacher: activeTeachers.find((teacher) => teacher.id === cls.teacherId),
                        }))
                        .filter(
                          (
                            entry
                          ): entry is typeof entry & { teacher: (typeof activeTeachers)[number] } =>
                            entry.teacher?.schoolId === school.id
                        )
                        .map(({ cls, teacher }) => ({
                          id: cls.id,
                          name: cls.name,
                          teacherName: teacher.name ?? teacher.email,
                        })),
                    }))}
                  />
                </EnrollmentForm>
              </div>
            </details>
            <details className="rounded-xl border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer font-semibold">Manage included teachers</summary>
              <p className="mt-2 text-sm text-slate-600">
                Review saved dates, availability, teachers, or remove a teacher from this workshop.
              </p>
              <section aria-label="Included teachers" className="mt-4 space-y-3">
                <h3 className="font-semibold">Included teachers</h3>
                {!run.classWorkshops.length && (
                  <p className="text-sm text-slate-600">
                    No teachers included yet. Use Add teachers to get started.
                  </p>
                )}
                {planningClasses
                  .filter(
                    ({ enrollment }) =>
                      enrollment.status !== 'WAIVED' &&
                      !enrollment.sessions.some((session) => session.status === 'COMPLETED')
                  )
                  .map(({ enrollment, active, firstCandidate, dateContext, teacher }) => {
                    const cls = enrollment.classSection
                    const row = active ? rows.find((item) => item.id === active.id) : undefined
                    const availabilityHref = `/admin/classes/${cls.id}?workshopDefinitionId=${id}&classSectionId=${cls.id}&week=${dateContext}`
                    const hasAvailability = Boolean(firstCandidate)
                    return (
                      <article
                        key={enrollment.id}
                        className="rounded-xl border border-slate-200 bg-white p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <Link href={availabilityHref} className="font-semibold underline">
                              {cls.name}
                            </Link>
                            <p className="text-sm text-slate-600">
                              {cls.school.name}
                              {cls.archivedAt ? ' · archived' : ''}
                            </p>
                            <p className="mt-1 text-sm">
                              {row
                                ? row.date
                                : !teacher
                                  ? 'Teacher contact needs review'
                                  : windowEnded
                                    ? 'Window ended · delivery outstanding'
                                    : hasAvailability
                                      ? 'Needs a date'
                                      : 'Needs teacher availability'}
                            </p>
                          </div>
                          <Link
                            href={
                              active
                                ? active.status === 'DRAFT'
                                  ? href(row?.problems.length ? 'staff' : 'publish', {
                                      ...resetScope,
                                      sessionId: active.id,
                                    })
                                  : `/admin/workshops/${active.id}`
                                : !teacher
                                  ? availabilityHref + '#teacher-contact'
                                  : windowEnded
                                    ? `/admin/class-workshops/${enrollment.id}`
                                    : hasAvailability
                                      ? href('plan', {
                                          ...resetScope,
                                          classSectionId: cls.id,
                                          week: dateContext,
                                        }) + '#class-dates'
                                      : availabilityHref
                            }
                            className="text-sm font-semibold underline"
                          >
                            {active
                              ? active.status === 'DRAFT'
                                ? row?.problems.length
                                  ? 'Staff session'
                                  : 'Review & publish'
                                : 'Manage published session'
                              : !teacher
                                ? 'Review teacher contact'
                                : windowEnded
                                  ? 'Review outstanding delivery'
                                  : hasAvailability
                                    ? 'Choose a teacher date'
                                    : 'Add teacher availability'}
                          </Link>
                        </div>
                        <details className="mt-3 text-sm">
                          <summary className="cursor-pointer text-slate-600">
                            Teacher details and options
                          </summary>
                          <p className="mt-2">
                            Teacher: {teacher?.name ?? teacher?.email ?? 'Contact needs review'}
                          </p>
                          {!active && (
                            <form action={updateClassWorkshopLifecycle} className="mt-3 space-y-2">
                              <LifecycleFields
                                runId={id}
                                enrollmentId={enrollment.id}
                                revision={enrollment.revision}
                                action="WAIVE"
                              />
                              <label className="block text-xs">
                                Reason delivery is not required
                                <input
                                  name="reason"
                                  className="input mt-1"
                                  required
                                  maxLength={1000}
                                />
                              </label>
                              <SubmitButton size="sm" variant="secondary">
                                Mark delivery not required
                              </SubmitButton>
                            </form>
                          )}
                          {!enrollment.sessions.length && !enrollment.availabilitySlots.length && (
                            <form action={updateClassWorkshopLifecycle} className="mt-3">
                              <LifecycleFields
                                runId={id}
                                enrollmentId={enrollment.id}
                                revision={enrollment.revision}
                                action="REMOVE"
                              />
                              <SubmitButton size="sm" variant="danger">
                                Remove teacher
                              </SubmitButton>
                            </form>
                          )}
                        </details>
                      </article>
                    )
                  })}
              </section>
            </details>
          </>
        ) : (
          <WorkshopDraftWorkspace
            key={`${step}:${query.batch ?? ''}:${query.classSectionId ?? ''}:${requestedSessionIds.join(':')}:${query.filter ?? ''}`}
            workshopDefinitionId={id}
            step={step}
            rows={scopedRows}
            filter={
              query.filter === 'needs-pas' || query.filter === 'ready' ? query.filter : undefined
            }
            inputHash={scheduleHash(snapshot)}
            focusedSessionId={query.sessionId}
            scoped={scoped}
            operations={operations.map((operation) => ({
              id: operation.id,
              summary: operation.summary,
              createdAt: operation.createdAt.toLocaleString('en-CA', {
                timeZone: 'America/Vancouver',
                dateStyle: 'medium',
                timeStyle: 'short',
              }),
              undone: operation.undoneAt !== null,
            }))}
          />
        )}
        {published.length > 0 && (
          <details
            open={published.some((row) => row.problems.length) || undefined}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <summary className="cursor-pointer font-semibold">
              Published sessions ({published.length})
            </summary>
            <p className="mt-2 text-sm text-slate-600">
              These sessions are official. Changes use the published-session review.
            </p>
            <ul className="mt-3 space-y-3">
              {published.map((row) => (
                <li key={row.id}>
                  <Link className="font-medium underline" href={`/admin/workshops/${row.id}`}>
                    {row.name} · {row.date}
                  </Link>
                  <p className="text-sm text-slate-600">
                    {row.assignments.map((pa) => pa.name).join(', ') || 'No PAs assigned'}
                  </p>
                  {row.problems.length > 0 && (
                    <p className="text-sm font-semibold text-red-900">
                      {row.assignments.length < row.minPAs
                        ? `Published · needs ${row.minPAs - row.assignments.length} PA${row.minPAs - row.assignments.length === 1 ? '' : 's'}`
                        : 'Published · needs review'}
                    </p>
                  )}
                  <Link
                    className="text-xs underline"
                    href={`/admin/workshops/${row.id}#communication`}
                  >
                    Record communication / manage changes
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )}
        {(history.length > 0 ||
          run.classWorkshops.some((enrollment) => enrollment.status === 'WAIVED')) && (
          <details className="rounded-xl border border-slate-200 bg-white p-4">
            <summary className="cursor-pointer font-semibold">History and not required</summary>
            <ul className="mt-3 space-y-3">
              {history.map((row) => (
                <li key={row.id}>
                  <Link className="text-sm underline" href={`/admin/workshops/${row.id}`}>
                    {row.name} · {row.date} · {row.status.toLowerCase()}
                  </Link>
                </li>
              ))}
              {run.classWorkshops
                .filter((enrollment) => enrollment.status === 'WAIVED')
                .map((enrollment) => (
                  <li
                    key={enrollment.id}
                    className="flex flex-wrap items-center justify-between gap-3"
                  >
                    <span className="text-sm">{enrollment.classSection.name} · Not required</span>
                    <form action={updateClassWorkshopLifecycle}>
                      <LifecycleFields
                        runId={id}
                        enrollmentId={enrollment.id}
                        revision={enrollment.revision}
                        action="RESTORE"
                      />
                      <SubmitButton size="sm" variant="secondary">
                        Restore {enrollment.classSection.name}
                      </SubmitButton>
                    </form>
                  </li>
                ))}
            </ul>
          </details>
        )}
      </WorkshopWorkspaceShell>
    </main>
  )
}

function LifecycleFields({
  runId,
  enrollmentId,
  revision,
  action,
}: {
  runId: string
  enrollmentId: string
  revision: number
  action: 'REMOVE' | 'WAIVE' | 'RESTORE'
}) {
  return (
    <>
      <input type="hidden" name="workshopDefinitionId" value={runId} />
      <input type="hidden" name="classWorkshopId" value={enrollmentId} />
      <input type="hidden" name="expectedRevision" value={revision} />
      <input type="hidden" name="action" value={action} />
    </>
  )
}
