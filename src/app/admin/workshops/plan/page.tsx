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
    <main className="mx-auto w-full max-w-3xl space-y-6 px-6 py-12">
      <Link href={'/admin/workshops?month=' + month} className="underline">
        Back to workshops
      </Link>
      <h1 className="text-3xl font-semibold">Plan monthly workshops</h1>
      <FormError
        message={query.error ?? (!parsed.success ? 'Invalid planning selection.' : undefined)}
      />
      <form method="get" className="space-y-4">
        <input type="hidden" name="preview" value="1" />
        <label className="block" htmlFor="plan-month">
          Planning month
        </label>
        <input
          id="plan-month"
          name="month"
          type="month"
          defaultValue={month}
          required
          className="rounded border p-2"
        />
        <ClassSelection
          classes={classes.map((c) => ({
            id: c.id,
            label: c.name + ' · ' + c.school.name + ' · target ' + c.monthlyCadence,
          }))}
          selected={classId}
        />
        <button className="rounded border px-4 py-2">Preview slots</button>
      </form>
      {preview && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Missing occurrences for {month}</h2>
          {selected.length === 0 && <p>Select at least one class.</p>}
          <ul className="space-y-3">
            {selected.map((cls) => (
              <li key={cls.id} className="rounded border p-3">
                <p>
                  {cls.name}: {cls.workshops.filter((w) => w.status !== 'CANCELLED').length}{' '}
                  planned/delivered of {cls.monthlyCadence};{' '}
                  {cls.workshops.filter((w) => w.status === 'CANCELLED').length} cancelled.
                </p>
                <p className="text-sm">
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
                <Link href={'/admin/classes/' + cls.id + '/edit'} className="text-sm underline">
                  Edit {cls.name}
                </Link>
              </li>
            ))}
          </ul>
          {rows.length > 0 ? (
            <form action={createWorkshopBatch} className="space-y-5">
              <input type="hidden" name="requestKey" value={randomUUID()} />
              <input type="hidden" name="month" value={month} />
              <p>
                Choose each date and start time explicitly within a hosting block. All choices are
                saved together.
              </p>
              {rows.map(({ cls, index }, row) => (
                <fieldset key={cls.id + index} className="space-y-3 rounded border p-4">
                  <legend>
                    {cls.name} · occurrence {index + 1}
                  </legend>
                  <input type="hidden" name="classSectionId" value={cls.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor={'date-' + row}>Vancouver date</label>
                      <input
                        id={'date-' + row}
                        name="date"
                        type="date"
                        required
                        min={month + '-01'}
                        max={new Date(end.getTime() - 86400000).toISOString().slice(0, 10)}
                        className="block w-full rounded border p-2"
                      />
                    </div>
                    <div>
                      <label htmlFor={'time-' + row}>Start time</label>
                      <input
                        id={'time-' + row}
                        name="startTime"
                        type="time"
                        required
                        className="block w-full rounded border p-2"
                      />
                    </div>
                    <div>
                      <label htmlFor={'duration-' + row}>Duration (minutes)</label>
                      <input
                        id={'duration-' + row}
                        name="durationMinutes"
                        type="number"
                        min="1"
                        required
                        defaultValue={cls.defaultDurationMinutes}
                        className="block w-full rounded border p-2"
                      />
                    </div>
                    <div>
                      <label htmlFor={'min-' + row}>Minimum PAs</label>
                      <input
                        id={'min-' + row}
                        name="minPAs"
                        type="number"
                        min="1"
                        required
                        defaultValue={cls.defaultMinPAs}
                        className="block w-full rounded border p-2"
                      />
                    </div>
                    <div>
                      <label htmlFor={'max-' + row}>Maximum PAs</label>
                      <input
                        id={'max-' + row}
                        name="maxPAs"
                        type="number"
                        min="1"
                        required
                        defaultValue={cls.defaultMaxPAs}
                        className="block w-full rounded border p-2"
                      />
                    </div>
                  </div>
                </fieldset>
              ))}
              <SubmitButton>Create planned workshops</SubmitButton>
            </form>
          ) : (
            selected.length > 0 && (
              <p>No missing occurrences can be planned from the current selection.</p>
            )
          )}
        </section>
      )}
    </main>
  )
}
