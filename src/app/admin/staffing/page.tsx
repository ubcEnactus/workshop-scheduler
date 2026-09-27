import Link from 'next/link'
import { AlertOctagon, AlertTriangle, CheckCircle2, Clock3 } from 'lucide-react'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { loadSchedule } from '@/lib/scheduling/store'
import { assessAssignment, totalAssignments } from '@/lib/scheduling/eligibility'
import { parseSchedulingContext, schedulingHref } from '@/lib/scheduling/navigation'
import {
  formatInstantRange,
  formatSlotRange,
  shiftMonth,
  vancouverDateKey,
  vancouverMonthKey,
} from '@/lib/time'
import { FormError } from '@/components/form-error'
import { ContextMonth } from '@/components/context-month'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'

function weekKey(date: string) {
  const value = new Date(`${date}T12:00:00Z`)
  const day = value.getUTCDay()
  if (day === 0 || day === 6) return date
  value.setUTCDate(value.getUTCDate() - (day - 1))
  return value.toISOString().slice(0, 10)
}

function maximumGroup(values: string[]) {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return Math.max(0, ...counts.values())
}

export default async function StaffingSettings({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requireRole('ADMIN')
  const query = await searchParams
  const context = parseSchedulingContext(query)
  const [snapshot, availabilityRows] = await prisma.$transaction(
    async (tx) =>
      Promise.all([
        loadSchedule(tx, { kind: 'month', month: context.month }),
        tx.availability.findMany({
          select: { userId: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
        }),
      ]),
    { isolationLevel: 'RepeatableRead' }
  )

  const rows = snapshot.pas.map((pa) => {
    const monthStart = `${context.month}-01`
    const nextMonthStart = `${shiftMonth(context.month, 1)}-01`
    const availability = snapshot.availability.filter((slot) => {
      if (slot.userId !== pa.id) return false
      const from = slot.effectiveFrom
        ? typeof slot.effectiveFrom === 'string'
          ? slot.effectiveFrom.slice(0, 10)
          : slot.effectiveFrom.toISOString().slice(0, 10)
        : '0000-01-01'
      const until = slot.effectiveUntil
        ? typeof slot.effectiveUntil === 'string'
          ? slot.effectiveUntil.slice(0, 10)
          : slot.effectiveUntil.toISOString().slice(0, 10)
        : null
      return from < nextMonthStart && (!until || until >= monthStart)
    })
    const commitments = snapshot.workshops.filter(
      (workshop) =>
        workshop.status !== 'CANCELLED' &&
        vancouverMonthKey(workshop.scheduledStart) === context.month &&
        workshop.assignments.some((assignment) => assignment.paId === pa.id)
    )
    const conflicts = commitments.flatMap((workshop) => {
      const assessment = assessAssignment(snapshot, workshop, pa.id)
      const reasons = [...assessment.hardErrors, ...assessment.availabilityWarnings]
      return reasons.length ? [{ workshop, reasons }] : []
    })
    const dates = commitments.map((workshop) => vancouverDateKey(workshop.scheduledStart))
    const lastUpdated = availabilityRows.find((row) => row.userId === pa.id)?.updatedAt
    const exceptions = (snapshot.availabilityExceptions ?? []).filter(
      (exception) =>
        exception.userId === pa.id &&
        (typeof exception.date === 'string'
          ? exception.date.slice(0, 7)
          : exception.date.toISOString().slice(0, 7)) === context.month
    )
    const periods = new Map<
      string,
      { from: Date | string | undefined; until: Date | string | null | undefined; slots: number }
    >()
    for (const slot of availability) {
      const key = `${slot.effectiveFrom ?? ''}|${slot.effectiveUntil ?? ''}`
      const period = periods.get(key) ?? {
        from: slot.effectiveFrom,
        until: slot.effectiveUntil,
        slots: 0,
      }
      period.slots += 1
      periods.set(key, period)
    }
    return {
      ...pa,
      name: pa.name ?? pa.email,
      availabilitySlots: availability.length,
      lastUpdated,
      total: totalAssignments(snapshot, pa.id),
      monthCommitments: commitments.length,
      busiestDay: maximumGroup(dates),
      busiestWeek: maximumGroup(dates.map(weekKey)),
      conflicts,
      availabilityPeriods: [...periods.values()],
      exceptions,
    }
  })

  return (
    <main className="page-content">
      <PageHeader
        eyebrow={`${context.month} staffing readiness`}
        title="Availability & workload"
        description="Review dated availability coverage, current commitments, and assignment conflicts. Monthly quotas are not required for assignment."
      >
        <Link className="text-sm underline" href={schedulingHref('/admin/workshops', context)}>
          ← Back to calendar
        </Link>
      </PageHeader>
      <FormError message={query.error} />
      <ContextMonth context={context} path="/admin/staffing" label="Commitment month" />

      <Panel
        title="PA availability and workload"
        description="Availability is checked against each dated session. Lifetime totals guide fair ranking only; missing legacy quota rows do not block assignment."
      >
        {rows.length ? (
          <div className="table-scroll" role="region" aria-label="PA readiness table" tabIndex={0}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>PA</th>
                  <th>Availability</th>
                  <th>Lifetime assignments</th>
                  <th>{context.month} commitments</th>
                  <th>Current conflicts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link
                        className="font-semibold text-slate-900 underline"
                        href={`/admin/pas/${row.id}/edit`}
                      >
                        {row.name}
                      </Link>
                      <p className="text-xs text-slate-500">{row.email}</p>
                    </td>
                    <td>
                      {row.availabilitySlots ? (
                        <>
                          <p className="font-medium text-green-800">
                            {row.availabilitySlots} effective 15-minute slot records
                          </p>
                          <ul className="mt-1 space-y-1 text-xs text-slate-500">
                            {row.availabilityPeriods.map((period, index) => (
                              <li key={index}>
                                {period.slots} slots · effective{' '}
                                {period.from
                                  ? new Date(period.from).toLocaleDateString('en-CA')
                                  : 'from the beginning'}{' '}
                                to{' '}
                                {period.until
                                  ? new Date(period.until).toLocaleDateString('en-CA')
                                  : 'ongoing'}
                              </li>
                            ))}
                          </ul>
                          <p className="text-xs text-slate-500">
                            {row.lastUpdated
                              ? `Updated ${row.lastUpdated.toLocaleDateString('en-CA')}`
                              : 'Update time unavailable'}
                          </p>
                          {row.exceptions.length > 0 && (
                            <details className="mt-1 text-xs text-amber-900">
                              <summary className="cursor-pointer font-medium">
                                {row.exceptions.length} dated exception
                                {row.exceptions.length === 1 ? '' : 's'} in this month
                              </summary>
                              <ul className="mt-1 space-y-1">
                                {row.exceptions.map((exception, index) => (
                                  <li key={`${String(exception.date)}:${index}`}>
                                    {typeof exception.date === 'string'
                                      ? exception.date.slice(0, 10)
                                      : exception.date.toISOString().slice(0, 10)}{' '}
                                    · {exception.kind === 'AVAILABLE' ? 'Available' : 'Unavailable'}
                                    {exception.startMinute != null && exception.endMinute != null
                                      ? ` · ${formatSlotRange(exception.startMinute, exception.endMinute - exception.startMinute)}`
                                      : ' · all day'}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </>
                      ) : (
                        <p className="font-medium text-amber-800">Missing availability</p>
                      )}
                    </td>
                    <td>{row.total}</td>
                    <td>
                      <p>{row.monthCommitments}</p>
                      <p className="text-xs text-slate-500">
                        Peak {row.busiestDay}/day · {row.busiestWeek}/week
                      </p>
                    </td>
                    <td>
                      {row.conflicts.length ? (
                        <details>
                          <summary className="cursor-pointer text-sm font-semibold text-red-800">
                            <span className="inline-flex items-center gap-1">
                              <AlertTriangle className="size-4" aria-hidden="true" />{' '}
                              {row.conflicts.length} to review
                            </span>
                          </summary>
                          <ul className="mt-2 space-y-3 text-xs leading-5 text-red-900">
                            {row.conflicts.map(({ workshop, reasons }) => (
                              <li key={workshop.id}>
                                <Link
                                  className="font-semibold underline"
                                  href={schedulingHref(`/admin/workshops/${workshop.id}`, context)}
                                >
                                  {workshop.definitionTitle ??
                                    workshop.schoolName ??
                                    'Teacher session'}
                                </Link>
                                <p>
                                  {formatInstantRange(
                                    workshop.scheduledStart,
                                    workshop.scheduledEnd
                                  )}
                                </p>
                                <ul className="list-disc pl-4">
                                  {reasons.map((reason) => (
                                    <li key={reason}>{reason}</li>
                                  ))}
                                </ul>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm text-green-800">
                          <CheckCircle2 className="size-4" aria-hidden="true" /> None
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <Clock3 className="size-6" aria-hidden="true" />
            <p>No active PAs.</p>
          </div>
        )}
      </Panel>

      <details className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer font-semibold text-slate-900">Assignment rules</summary>
        <section className="mt-4 grid gap-4 md:grid-cols-3" aria-label="Assignment policy">
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="flex items-center gap-2 font-semibold text-slate-900">
              <CheckCircle2 className="size-4 text-green-700" aria-hidden="true" /> Hard
              requirements
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Availability must cover the full session and assignments cannot overlap. These rules
              cannot be overridden.
            </p>
          </div>
          <div className="rounded-xl border border-red-300 bg-red-50 p-4">
            <p className="flex items-center gap-2 font-semibold text-red-900">
              <AlertOctagon className="size-4" aria-hidden="true" /> Same-day exception
            </p>
            <p className="mt-2 text-sm leading-6 text-red-800">
              Automatic matching assigns at most one session per day. A second session needs a
              prominent admin confirmation and recorded reason.
            </p>
          </div>
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="flex items-center gap-2 font-semibold text-amber-900">
              <AlertTriangle className="size-4" aria-hidden="true" /> Weekly exception
            </p>
            <p className="mt-2 text-sm leading-6 text-amber-800">
              Automatic matching assigns at most one session in each Monday–Friday Vancouver week. A
              different-day exception needs admin review and a reason.
            </p>
          </div>
        </section>
      </details>
    </main>
  )
}
