import Link from 'next/link'
import { Pencil, Users } from 'lucide-react'

import { FormError } from '@/components/form-error'
import { SubmitButton } from '@/components/submit-button'
import { buttonClasses } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { StatusBadge } from '@/components/ui/status-badge'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { parseSchedulingContext, schedulingHref } from '@/lib/scheduling/navigation'
import { isReturningToClassSetup } from '@/lib/schemas/class-setup'

import { createTeacher } from './actions'

export default async function TeachersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requireRole('ADMIN')
  const query = await searchParams
  const { error, q } = query
  const context = parseSchedulingContext(query)
  const returnToClasses = isReturningToClassSetup(query.returnToClasses)
  const search = q?.trim() ?? ''
  const [teachers, schools] = await Promise.all([
    prisma.user.findMany({
      where: {
        role: 'TEACHER',
        deletedAt: null,
        school: { deletedAt: null },
        ...(query.schoolId ? { schoolId: query.schoolId } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { email: { contains: search, mode: 'insensitive' as const } },
                { school: { name: { contains: search, mode: 'insensitive' as const } } },
              ],
            }
          : {}),
      },
      include: { school: true, classesTaught: { select: { id: true, archivedAt: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.school.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } }),
  ])

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="People"
        title="Schools & teachers"
        description="Each teacher represents their class. Open a teacher to manage availability, workshop enrollment, and session defaults."
        actions={
          returnToClasses ? (
            <Link
              href={schedulingHref('/admin/classes', context, { add: '1' }) + '#add-class'}
              className={buttonClasses({ variant: 'secondary' })}
            >
              Back to teachers
            </Link>
          ) : (
            <Link href="/admin/schools" className={buttonClasses({ variant: 'secondary' })}>
              Schools
            </Link>
          )
        }
      />
      <FormError message={error} />
      {returnToClasses && query.saved === 'school' && (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          School added. Add its teacher contact next.
        </p>
      )}

      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(19rem,0.75fr)_minmax(0,1.25fr)]">
        <Panel
          title="Add teacher"
          description="Add a teacher, then record their availability. Their availability and workshops are saved here."
        >
          {schools.length === 0 && (
            <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Add a school before adding a teacher.{' '}
              <Link
                href={
                  returnToClasses
                    ? schedulingHref('/admin/schools', context, { returnToClasses: '1' })
                    : '/admin/schools'
                }
                className="font-semibold underline"
              >
                Go to schools
              </Link>
              .
            </div>
          )}
          <form action={createTeacher} className="space-y-5">
            {
              <>
                <input type="hidden" name="returnToClasses" value="1" />
                {Object.entries(context).map(([key, value]) => (
                  <input
                    key={key}
                    type="hidden"
                    name={key === 'schoolId' ? 'returnSchoolId' : key}
                    value={value}
                  />
                ))}
              </>
            }
            <div className="field">
              <label htmlFor="teacher-name">Name</label>
              <input id="teacher-name" name="name" required className="input" />
            </div>
            <div className="field">
              <label htmlFor="teacher-email">Email</label>
              <input id="teacher-email" name="email" type="email" required className="input" />
            </div>
            <div className="field">
              <label htmlFor="teacher-school">School</label>
              <select
                id="teacher-school"
                name="schoolId"
                required
                defaultValue={query.schoolId ?? ''}
                className="input min-w-0"
              >
                <option value="">Select a school…</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </div>
            <SubmitButton disabled={schools.length === 0}>Add teacher</SubmitButton>
          </form>
        </Panel>

        <Panel
          title="Teacher directory"
          description={`${teachers.length} active teacher${teachers.length === 1 ? '' : 's'}`}
        >
          <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
            {returnToClasses && (
              <>
                <input type="hidden" name="returnToClasses" value="1" />
                {Object.entries(context).map(([key, value]) => (
                  <input key={key} type="hidden" name={key} value={value} />
                ))}
              </>
            )}
            <label className="field min-w-56 flex-1">
              Search teacher or school
              <input className="input" type="search" name="q" defaultValue={search} />
            </label>
            <button type="submit" className={buttonClasses({ variant: 'secondary' })}>
              Search
            </button>
          </form>
          {teachers.length === 0 ? (
            <div className="empty-state">
              <Users className="size-6" aria-hidden="true" />
              <p>No teachers yet.</p>
            </div>
          ) : (
            <>
              <p className="mb-3 text-xs font-medium text-slate-500 sm:hidden">
                Scroll sideways to view all columns and actions.
              </p>
              <div className="table-scroll relative w-full min-w-0">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Teacher</th>
                      <th>School</th>
                      <th>Status</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {teachers.map((teacher) => (
                      <tr key={teacher.id}>
                        <td>
                          <Link
                            className="font-semibold text-slate-900 underline"
                            href={`/admin/teachers/${teacher.id}`}
                          >
                            {teacher.name ?? teacher.email}
                          </Link>
                          <p className="text-xs text-slate-500">{teacher.email}</p>
                        </td>
                        <td>
                          {teacher.school ? (
                            <Link
                              className="underline"
                              href={'/admin/schools/' + teacher.school.id}
                            >
                              {teacher.school.name}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <StatusBadge
                            status={teacher.classesTaught[0]?.archivedAt ? 'inactive' : 'active'}
                          />
                        </td>
                        <td>
                          <div className="flex justify-end gap-2">
                            <Link
                              href={`/admin/teachers/${teacher.id}/edit`}
                              aria-label={`Edit ${teacher.name ?? teacher.email}`}
                              className={buttonClasses({ variant: 'ghost', size: 'sm' })}
                            >
                              <Pencil className="size-3.5" aria-hidden="true" /> Edit contact
                            </Link>
                            <Link
                              href={`/admin/teachers/${teacher.id}`}
                              className={buttonClasses({ size: 'sm' })}
                            >
                              Availability & workshops
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>
      </div>
    </main>
  )
}
