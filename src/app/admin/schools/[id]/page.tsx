import Link from 'next/link'
import { notFound } from 'next/navigation'
import { buttonClasses } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { StatusBadge } from '@/components/ui/status-badge'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { classWorkshopStatusLabel } from '@/lib/scheduling/class-workshops'

export default async function SchoolDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ q?: string; archived?: string }>
}) {
  await requireRole('ADMIN')
  const [{ id }, query] = await Promise.all([params, searchParams])
  const search = query.q?.trim() ?? ''
  const includeArchived = query.archived === '1'
  const school = await prisma.school.findFirst({
    where: { id, deletedAt: null },
    include: {
      teachers: {
        where: { role: 'TEACHER', deletedAt: null },
        orderBy: { name: 'asc' },
        include: { _count: { select: { classesTaught: true } } },
      },
      classSections: {
        where: {
          ...(includeArchived ? {} : { archivedAt: null }),
        },
        orderBy: { name: 'asc' },
        include: {
          teacher: true,
          classWorkshops: {
            orderBy: { workshopDefinition: { deliveryStartsOn: 'desc' } },
            include: { workshopDefinition: true, sessions: { select: { id: true, status: true } } },
          },
        },
      },
    },
  })
  if (!school) notFound()
  const normalizedSearch = search.toLocaleLowerCase()
  const classes = school.classSections
    .map((cls) => {
      const effectiveTeacherId = cls.teacherId
      const effectiveTeacher =
        school.teachers.find((teacher) => teacher.id === effectiveTeacherId) ?? cls.teacher
      return {
        ...cls,
        effectiveTeacherId,
        effectiveTeacher,
        effectiveTeacherActive: school.teachers.some(
          (teacher) => teacher.id === effectiveTeacherId
        ),
      }
    })
    .filter(
      (cls) =>
        !normalizedSearch ||
        [
          cls.name,
          cls.subject,
          cls.grade,
          cls.effectiveTeacher.name,
          cls.effectiveTeacher.email,
        ].some((value) => value?.toLocaleLowerCase().includes(normalizedSearch))
    )

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="School"
        title={school.name}
        description={`${classes.length} teachers`}
        actions={
          <>
            <Link href={'/admin/schools/' + school.id + '/edit'} className={buttonClasses()}>
              Edit school
            </Link>
            <Link href="/admin/schools" className={buttonClasses({ variant: 'secondary' })}>
              All schools
            </Link>
          </>
        }
      />
      <Panel
        title="Teachers"
        description="Search this school and open a teacher to review availability, run coverage, sessions, and history."
      >
        <form
          method="get"
          className="mb-5 flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 p-4"
        >
          <label className="field min-w-56 flex-1">
            Search teachers or teachers
            <input className="input" type="search" name="q" defaultValue={search} />
          </label>
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" name="archived" value="1" defaultChecked={includeArchived} />
            Include archived
          </label>
          <button type="submit" className={buttonClasses({ variant: 'secondary' })}>
            Search
          </button>
        </form>
        {classes.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {classes.map((cls) => (
              <article key={cls.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link className="font-semibold underline" href={'/admin/classes/' + cls.id}>
                      {cls.name}
                    </Link>
                    <p className="mt-1 text-sm text-slate-600">
                      {cls.subject ?? 'Subject not set'}
                      {cls.grade ? ` · Grade ${cls.grade}` : ''}
                      {cls.archivedAt ? ' · Archived' : ''}
                    </p>
                    {cls.effectiveTeacherActive ? (
                      <Link
                        className="mt-1 inline-block text-sm underline"
                        href={'/admin/teachers/' + cls.effectiveTeacherId + '/edit'}
                      >
                        {cls.effectiveTeacher.name ?? cls.effectiveTeacher.email}
                      </Link>
                    ) : (
                      <p className="mt-1 text-sm font-semibold text-red-800">
                        Teacher contact needs review
                      </p>
                    )}
                  </div>
                  <Link className={buttonClasses({ size: 'sm' })} href={'/admin/classes/' + cls.id}>
                    Open teacher
                  </Link>
                </div>
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    Run progress · {cls.classWorkshops.length}
                  </p>
                  {cls.classWorkshops.length ? (
                    <ul className="mt-2 space-y-2">
                      {cls.classWorkshops.slice(0, 4).map((enrollment) => (
                        <li
                          key={enrollment.id}
                          className="flex flex-wrap items-center justify-between gap-2 text-sm"
                        >
                          <Link
                            className="underline"
                            href={'/admin/workshop-definitions/' + enrollment.workshopDefinitionId}
                          >
                            {enrollment.workshopDefinition.title}
                          </Link>
                          <StatusBadge
                            status={enrollment.status}
                            label={classWorkshopStatusLabel(enrollment.status)}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">No workshop runs enrolled.</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-600">No teachers match these filters.</p>
        )}
      </Panel>
    </main>
  )
}
