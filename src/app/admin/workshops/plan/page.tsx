import { randomUUID } from 'node:crypto'
import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { planningQuerySchema } from '@/lib/schemas/planning'
import { vancouverMonthBounds, vancouverMonthKey, DAY_LABELS, formatSlotRange } from '@/lib/time'
import { FormError } from '@/components/form-error'
import { ClassSelection } from '@/components/class-selection'
import { SubmitButton } from '@/components/submit-button'
import { createWorkshopBatch } from './actions'
import { CalendarDays, Clock3, ListChecks } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { StatusBadge } from '@/components/ui/status-badge'
import { buttonClasses } from '@/components/ui/button'

export default async function MonthlyPlan({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string
    classId?: string | string[]
    preview?: string
    error?: string
  }>
}) {
  await requireRole('ADMIN')
  const query = await searchParams
  const parsed = planningQuerySchema.safeParse({
    month: query.month ?? vancouverMonthKey(),
    classId: Array.isArray(query.classId) ? query.classId : query.classId ? [query.classId] : [],
    preview: query.preview === '1',
  })
  const { month, classId, preview } = parsed.success
    ? parsed.data
    : { month: vancouverMonthKey(), classId: [], preview: false }
  const { start, end } = vancouverMonthBounds(month)
  const classes = await prisma.classSection.findMany({
    where: { school: { deletedAt: null }, teacher: { deletedAt: null, role: 'TEACHER' } },
    include: {
      school: true,
      meetings: true,
      workshops: { where: { scheduledStart: { gte: start, lt: end } } },
    },
    orderBy: { name: 'asc' },
  })
  const selected = classes.filter((c) => classId.includes(c.id))
  const rows = selected.flatMap((cls) =>
    cls.meetings.length === 0
      ? []
      : Array.from(
          {
            length: Math.max(
              0,
              cls.monthlyCadence - cls.workshops.filter((w) => w.status !== 'CANCELLED').length
            ),
          },
          (_, index) => ({ cls, index })
        )
  )
  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Schedule workspace"
        title="Plan monthly workshops"
        description="Choose classes, preview missing occurrences, then set each workshop inside a recorded hosting block."
      >
        <Link
          href={'/admin/workshops?month=' + month}
          className="text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          ← Back to workshops
        </Link>
      </PageHeader>
      <FormError
        message={query.error ?? (!parsed.success ? 'Invalid planning selection.' : undefined)}
      />
      <Panel
        title="1. Choose the month and classes"
        description="Targets account for workshops already planned or delivered this month."
      >
        <form method="get" className="space-y-5">
          <input type="hidden" name="preview" value="1" />
          <div className="field max-w-xs">
            <label htmlFor="plan-month">Planning month</label>
            <input
              id="plan-month"
              name="month"
              type="month"
              defaultValue={month}
              required
              className="input"
            />
          </div>
          <ClassSelection
            classes={classes.map((c) => ({
              id: c.id,
              label: c.name + ' · ' + c.school.name + ' · target ' + c.monthlyCadence,
            }))}
            selected={classId}
          />
          <button className={buttonClasses()}>
            <ListChecks className="size-4" /> Preview slots
          </button>
        </form>
      </Panel>
      {preview && (
        <Panel
          title={`2. Missing occurrences for ${month}`}
          description={`${rows.length} workshop slot${rows.length === 1 ? '' : 's'} ready to date.`}
        >
          {selected.length === 0 && <div className="empty-state">Select at least one class.</div>}
          <ul className="grid gap-3 sm:grid-cols-2">
            {selected.map((cls) => (
              <li key={cls.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{cls.name}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {cls.workshops.filter((w) => w.status !== 'CANCELLED').length}{' '}
                      planned/delivered of {cls.monthlyCadence};{' '}
                      {cls.workshops.filter((w) => w.status === 'CANCELLED').length} cancelled.
                    </p>
                  </div>
                  <StatusBadge status={cls.meetings.length ? 'READY' : 'NEEDS SETUP'} />
                </div>
                <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-500">
                  <Clock3 className="mt-0.5 size-3.5 shrink-0" />
                  {cls.meetings.length
                    ? cls.meetings
                        .map(
                          (m) =>
                            DAY_LABELS[m.dayOfWeek] +
                            ' ' +
                            formatSlotRange(m.startMinute, m.endMinute - m.startMinute)
                        )
                        .join('; ')
                    : 'No hosting blocks. Add class meeting times before planning.'}
                </p>
                <Link
                  href={'/admin/classes/' + cls.id + '/edit'}
                  className="mt-3 inline-block text-xs font-semibold text-[#1e2a4a] hover:underline"
                >
                  Edit {cls.name}
                </Link>
              </li>
            ))}
          </ul>
          {rows.length > 0 ? (
            <form
              action={createWorkshopBatch}
              className="mt-6 space-y-5 border-t border-slate-100 pt-6"
            >
              <input type="hidden" name="requestKey" value={randomUUID()} />
              <input type="hidden" name="month" value={month} />
              <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                <CalendarDays className="mt-0.5 size-5 shrink-0" />
                <p>
                  Choose each date and start time explicitly within a hosting block. All choices are
                  saved together.
                </p>
              </div>
              {rows.map(({ cls, index }, row) => (
                <fieldset
                  key={cls.id + index}
                  className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
                >
                  <legend className="px-2 text-sm font-semibold text-slate-900">
                    {cls.name} · occurrence {index + 1}
                  </legend>
                  <input type="hidden" name="classSectionId" value={cls.id} />
                  <div className="form-grid lg:grid-cols-3">
                    <div className="field">
                      <label htmlFor={'date-' + row}>Vancouver date</label>
                      <input
                        id={'date-' + row}
                        name="date"
                        type="date"
                        required
                        min={month + '-01'}
                        max={new Date(end.getTime() - 86400000).toISOString().slice(0, 10)}
                        className="input"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={'time-' + row}>Start time</label>
                      <input
                        id={'time-' + row}
                        name="startTime"
                        type="time"
                        required
                        className="input"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={'duration-' + row}>Duration (minutes)</label>
                      <input
                        id={'duration-' + row}
                        name="durationMinutes"
                        type="number"
                        min="1"
                        required
                        defaultValue={cls.defaultDurationMinutes}
                        className="input"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={'min-' + row}>Minimum PAs</label>
                      <input
                        id={'min-' + row}
                        name="minPAs"
                        type="number"
                        min="1"
                        required
                        defaultValue={cls.defaultMinPAs}
                        className="input"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={'max-' + row}>Maximum PAs</label>
                      <input
                        id={'max-' + row}
                        name="maxPAs"
                        type="number"
                        min="1"
                        required
                        defaultValue={cls.defaultMaxPAs}
                        className="input"
                      />
                    </div>
                  </div>
                </fieldset>
              ))}
              <SubmitButton>Create planned workshops</SubmitButton>
            </form>
          ) : (
            selected.length > 0 && (
              <div className="empty-state mt-5">
                No missing occurrences can be planned from the current selection.
              </div>
            )
          )}
        </Panel>
      )}
    </main>
  )
}
