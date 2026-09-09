import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { FormError } from '@/components/form-error'
import { WorkshopForm } from '@/components/workshop-form'
import { monthSchema } from '@/lib/schemas/workshops'
import { formatInstantRange, shiftMonth, vancouverMonthBounds, vancouverMonthKey } from '@/lib/time'
import { createWorkshop } from './actions'

export default async function WorkshopsPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string
    schoolId?: string
    classSectionId?: string
    error?: string
  }>
}) {
  await requireRole('ADMIN')
  const query = await searchParams
  const parsed = monthSchema.safeParse(query.month ?? vancouverMonthKey())
  const month = parsed.success ? parsed.data : vancouverMonthKey()
  const { start, end } = vancouverMonthBounds(month)
  const [workshops, classes, schools] = await Promise.all([
    prisma.workshop.findMany({
      where: {
        scheduledStart: { gte: start, lt: end },
        ...(query.classSectionId ? { classSectionId: query.classSectionId } : {}),
        classSection: {
          ...(query.schoolId ? { schoolId: query.schoolId } : {}),
          school: { deletedAt: null },
          teacher: { deletedAt: null },
        },
      },
      include: {
        classSection: { include: { school: true } },
        _count: { select: { assignments: true } },
      },
      orderBy: [{ scheduledStart: 'asc' }, { id: 'asc' }],
    }),
    prisma.classSection.findMany({
      where: { school: { deletedAt: null }, teacher: { deletedAt: null, role: 'TEACHER' } },
      include: {
        school: true,
        teacher: true,
        meetings: { orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.school.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } }),
  ])
  const monthHref = (value: string) =>
    `/admin/workshops?${new URLSearchParams({ month: value, ...(query.schoolId ? { schoolId: query.schoolId } : {}), ...(query.classSectionId ? { classSectionId: query.classSectionId } : {}) })}`
  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-6 py-12">
      <header>
        <Link href="/admin" className="text-sm underline">
          Admin home
        </Link>
        <h1 className="mt-4 text-3xl font-semibold">Workshops</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Plan dated drafts, then review each workshop. Drafts are private to admins.
        </p>
      </header>
      <FormError
        message={
          query.error ??
          (!parsed.success ? 'Invalid month. Showing the current Vancouver month.' : undefined)
        }
      />
      <form method="get" className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="month" className="block text-sm font-medium">
            Month
          </label>
          <input
            id="month"
            name="month"
            type="month"
            defaultValue={month}
            required
            className="mt-1 rounded border p-2"
          />
        </div>
        <div>
          <label htmlFor="school" className="block text-sm font-medium">
            School filter
          </label>
          <select
            id="school"
            name="schoolId"
            defaultValue={query.schoolId ?? ''}
            className="mt-1 max-w-full rounded border p-2"
          >
            <option value="">All schools</option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="class-filter" className="block text-sm font-medium">
            Class filter
          </label>
          <select
            id="class-filter"
            name="classSectionId"
            defaultValue={query.classSectionId ?? ''}
            className="mt-1 max-w-full rounded border p-2"
          >
            <option value="">All classes</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>
        </div>
        <button className="rounded border px-4 py-2" type="submit">
          Show month
        </button>
      </form>
      <nav aria-label="Month navigation" className="flex flex-wrap justify-between gap-4">
        <Link href={monthHref(shiftMonth(month, -1))} className="underline">
          Previous month
        </Link>
        <span className="font-medium">{month} · Vancouver</span>
        <Link href={monthHref(shiftMonth(month, 1))} className="underline">
          Next month
        </Link>
      </nav>
      {workshops.length === 0 ? (
        <p>No workshops in this month for these filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Workshops for {month}, America/Vancouver</caption>
            <thead className="border-b">
              <tr>
                {['Class', 'School', 'Vancouver date/time', 'Staffing', 'Status', 'Editing'].map(
                  (label) => (
                    <th key={label} scope="col" className="p-3">
                      {label}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {workshops.map((workshop) => (
                <tr key={workshop.id} className="border-b">
                  <td className="p-3">
                    <Link href={`/admin/workshops/${workshop.id}`} className="underline">
                      {workshop.classSection.name}
                    </Link>
                  </td>
                  <td className="p-3">{workshop.classSection.school.name}</td>
                  <td className="p-3">
                    {formatInstantRange(workshop.scheduledStart, workshop.scheduledEnd)}
                  </td>
                  <td className="p-3">
                    {workshop._count.assignments} assigned · {workshop.minPAs}–{workshop.maxPAs}{' '}
                    needed
                  </td>
                  <td className="p-3">{workshop.status.toLowerCase()}</td>
                  <td className="p-3">
                    {workshop.status === 'DRAFT' && workshop._count.assignments === 0
                      ? 'Editable'
                      : 'Protected'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <section className="max-w-2xl">
        <h2 className="mb-4 text-xl font-medium">Create workshop</h2>
        <WorkshopForm action={createWorkshop} classes={classes} month={month} />
      </section>
    </main>
  )
}
