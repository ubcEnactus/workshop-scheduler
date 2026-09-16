import { randomUUID } from 'node:crypto'
import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { vancouverMonthBounds } from '@/lib/time'
import { normalizeSchedulingContext, schedulingHref } from '@/lib/scheduling/navigation'
import { FormError } from '@/components/form-error'
import { ClassSelection } from '@/components/class-selection'
import { PlanningForm } from '@/components/planning-form'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { buttonClasses } from '@/components/ui/button'

export default async function MonthlyPlan({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireRole('ADMIN')
  const query = await searchParams
  const [allClasses, schools] = await Promise.all([
    prisma.classSection.findMany({
      where: { school: { deletedAt: null }, teacher: { deletedAt: null, role: 'TEACHER' } },
      include: { school: true, teacher: true, meetings: true },
      orderBy: { name: 'asc' },
    }),
    prisma.school.findMany({ where: { deletedAt: null }, select: { id: true } }),
  ])
  const activeClasses = allClasses.filter((c) => c.teacher.schoolId === c.schoolId)
  const { context, warning } = normalizeSchedulingContext(query, activeClasses, schools)
  const { start, end } = vancouverMonthBounds(context.month)
  const workshops = await prisma.workshop.findMany({
    where: { scheduledStart: { gte: start, lt: end } },
    include: { classSection: { select: { teacherId: true } } },
  })
  const classes = activeClasses.filter((c) => !context.schoolId || c.schoolId === context.schoolId)
  const explicit = query.classId !== undefined || query.selection === '1'
  const ids = Array.isArray(query.classId) ? query.classId : query.classId ? [query.classId] : []
  const selectedIds = explicit
    ? ids
    : context.classSectionId
      ? [context.classSectionId]
      : context.schoolId
        ? classes.map((c) => c.id)
        : []
  const selected = classes.filter((c) => selectedIds.includes(c.id))
  const rows = selected.flatMap((cls) =>
    cls.meetings.length
      ? Array.from(
          {
            length: Math.max(
              0,
              cls.monthlyCadence -
                workshops.filter((w) => w.classSectionId === cls.id && w.status !== 'CANCELLED')
                  .length
            ),
          },
          (_, index) => ({
            cls: {
              ...cls,
              busy: workshops
                .filter(
                  (w) => w.status !== 'CANCELLED' && w.classSection.teacherId === cls.teacherId
                )
                .map((w) => ({
                  start: w.scheduledStart.toISOString(),
                  end: w.scheduledEnd.toISOString(),
                })),
            },
            index,
          })
        )
      : []
  )
  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Schedule workspace"
        title="Plan monthly workshops"
        description="Choose classes, then select dates within their recorded availability."
      >
        <Link className="text-sm underline" href={schedulingHref('/admin/workshops', context)}>
          ← Back to workshops
        </Link>
      </PageHeader>
      <FormError message={typeof query.error === 'string' ? query.error : warning} />
      <Panel title="1. Choose the month and classes">
        <form method="get" className="space-y-4">
          <input type="hidden" name="preview" value="1" />
          <input type="hidden" name="selection" value="1" />
          {Object.entries(context)
            .filter(([key]) => key !== 'month')
            .map(([key, value]) => (
              <input type="hidden" key={key} name={key} value={value} />
            ))}
          <label className="field max-w-xs">
            Planning month
            <input
              type="month"
              name="month"
              required
              defaultValue={context.month}
              className="input"
            />
          </label>
          <ClassSelection
            classes={classes.map((c) => ({
              id: c.id,
              label: c.name + ' · ' + c.school.name + ' · target ' + c.monthlyCadence,
            }))}
            selected={query.selection === '1' && !explicit ? [] : selectedIds}
          />
          <button className={buttonClasses()}>Preview slots</button>
        </form>
      </Panel>
      {query.preview === '1' && (
        <Panel
          title={'2. Missing occurrences for ' + context.month}
          description={rows.length + ' workshop slots ready to date.'}
        >
          {selected.length === 0 ? (
            <p>Select at least one class.</p>
          ) : (
            <>
              <ul className="mb-4 space-y-2 text-sm">
                {selected.map((cls) => (
                  <li key={cls.id}>
                    {cls.name}:{' '}
                    {
                      workshops.filter(
                        (w) => w.classSectionId === cls.id && w.status !== 'CANCELLED'
                      ).length
                    }{' '}
                    planned/delivered of {cls.monthlyCadence};{' '}
                    {
                      workshops.filter(
                        (w) => w.classSectionId === cls.id && w.status === 'CANCELLED'
                      ).length
                    }{' '}
                    cancelled.{' '}
                    {!cls.meetings.length && (
                      <Link
                        className="text-amber-800 underline"
                        href={schedulingHref('/admin/classes/' + cls.id + '/edit', context)}
                      >
                        Add class availability before planning.
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
              {rows.length ? (
                <PlanningForm
                  key={context.month + selected.map((c) => c.id).join(',')}
                  context={context}
                  requestKey={randomUUID()}
                  rows={rows}
                />
              ) : (
                <p>No missing occurrences can be planned from the current selection.</p>
              )}
            </>
          )}
        </Panel>
      )}
    </main>
  )
}
