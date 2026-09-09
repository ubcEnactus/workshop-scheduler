import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { monthSchema } from '@/lib/schemas/workshops'
import { vancouverMonthKey } from '@/lib/time'
import { ClassSelection } from '@/components/class-selection'
import { FormError } from '@/components/form-error'
import { SubmitButton } from '@/components/submit-button'
import { previewMatching } from './actions'
export default async function MatchPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; error?: string }>
}) {
  await requireRole('ADMIN')
  const query = await searchParams
  const parsed = monthSchema.safeParse(query.month ?? vancouverMonthKey())
  const month = parsed.success ? parsed.data : vancouverMonthKey()
  const classes = await prisma.classSection.findMany({
    where: { school: { deletedAt: null }, teacher: { deletedAt: null, role: 'TEACHER' } },
    include: { school: true },
    orderBy: { name: 'asc' },
  })
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <Link className="underline" href={'/admin/workshops?month=' + month}>
        Workshops
      </Link>
      <h1 className="text-3xl font-semibold">Assign PAs automatically</h1>
      <p>
        Preview staffing for existing dated workshops. Locked, manually staffed and published work
        stays protected.
      </p>
      <p>
        This greedy matcher fills minimum staffing first, then optional places, balancing toward
        monthly quotas. It may leave feasible combinations undiscovered.
      </p>
      <FormError message={query.error} />
      <form action={previewMatching} className="space-y-5">
        <label className="block">
          Month{' '}
          <input
            aria-label="Month"
            type="month"
            name="month"
            required
            defaultValue={month}
            className="rounded border p-2"
          />
        </label>
        <ClassSelection
          classes={classes.map((c) => ({ id: c.id, label: c.name + ' · ' + c.school.name }))}
          selected={classes.map((c) => c.id)}
        />
        <SubmitButton>Preview PA assignments</SubmitButton>
      </form>
    </main>
  )
}
