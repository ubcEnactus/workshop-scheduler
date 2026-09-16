import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { normalizeSchedulingContext, schedulingHref } from '@/lib/scheduling/navigation'
import { ClassSelection } from '@/components/class-selection'
import { FormError } from '@/components/form-error'
import { SubmitButton } from '@/components/submit-button'
import { previewMatching } from './actions'
import { LockKeyhole, Scale } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
export default async function MatchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireRole('ADMIN')
  const query = await searchParams
  const classes = await prisma.classSection.findMany({
    where: { school: { deletedAt: null }, teacher: { deletedAt: null, role: 'TEACHER' } },
    include: { school: true },
    orderBy: { name: 'asc' },
  })
  const schools = await prisma.school.findMany({ where: { deletedAt: null }, select: { id: true } })
  const { context, warning } = normalizeSchedulingContext(query, classes, schools)
  const month = context.month
  const selected =
    query.selection === '1'
      ? Array.isArray(query.classId)
        ? query.classId
        : query.classId
          ? [query.classId]
          : []
      : classes
          .filter(
            (c) =>
              (!context.schoolId || c.schoolId === context.schoolId) &&
              (!context.classSectionId || c.id === context.classSectionId)
          )
          .map((c) => c.id)
  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Schedule workspace"
        title="Assign PAs automatically"
        description="Generate a reviewable staffing proposal for workshops that already have dates and times."
      >
        <Link
          className="text-sm font-medium text-slate-500 hover:text-slate-900"
          href={schedulingHref('/admin/workshops', context)}
        >
          ← Workshops
        </Link>
      </PageHeader>
      <FormError message={typeof query.error === 'string' ? query.error : warning} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-blue-900">
            <Scale className="size-4" /> Fair, constraint-aware matching
          </p>
          <p className="mt-2 text-sm leading-6 text-blue-800">
            Minimum staffing is filled first, then optional places are balanced toward monthly
            quotas.
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <LockKeyhole className="size-4" /> Protected work stays put
          </p>
          <p className="mt-2 text-sm leading-6 text-amber-800">
            Locked, manually staffed, and published workshops are retained. Some feasible
            combinations may remain undiscovered.
          </p>
        </div>
      </div>
      <Panel
        title="Build a staffing preview"
        description="Choose a calendar month and the classes to include."
      >
        <form action={previewMatching} className="space-y-5">
          {Object.entries(context)
            .filter(([key]) => key !== 'month')
            .map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
          <label className="field max-w-xs">
            Month
            <input
              aria-label="Month"
              type="month"
              name="month"
              required
              defaultValue={month}
              className="input"
            />
          </label>
          <ClassSelection
            classes={classes.map((c) => ({ id: c.id, label: c.name + ' · ' + c.school.name }))}
            selected={selected}
          />
          <SubmitButton>Preview PA assignments</SubmitButton>
        </form>
      </Panel>
    </main>
  )
}
