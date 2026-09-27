import Link from 'next/link'
import { Pencil, School } from 'lucide-react'

import { FormError } from '@/components/form-error'
import { SubmitButton } from '@/components/submit-button'
import { buttonClasses } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { parseSchedulingContext, schedulingHref } from '@/lib/scheduling/navigation'
import { isReturningToClassSetup } from '@/lib/schemas/class-setup'

import { createSchool, softDeleteSchool } from './actions'

export default async function SchoolsPage({
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
  const schools = await prisma.school.findMany({
    where: {
      deletedAt: null,
      ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
    },
    include: { _count: { select: { teachers: true, classSections: true } } },
    orderBy: { name: 'asc' },
  })

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Program setup"
        title="Schools"
        description="Manage partner schools. Deactivating a school keeps its history and removes it from new scheduling."
        actions={
          returnToClasses ? (
            <Link
              href={schedulingHref('/admin/classes', context, { add: '1' }) + '#add-class'}
              className={buttonClasses({ variant: 'secondary' })}
            >
              Back to teacher setup
            </Link>
          ) : (
            <Link
              href={schedulingHref('/admin/teachers', context)}
              className={buttonClasses({ variant: 'secondary' })}
            >
              Teachers
            </Link>
          )
        }
      />
      <FormError message={error} />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(18rem,0.7fr)_minmax(0,1.3fr)]">
        <Panel title="Add school" description="Create a school before adding its teachers.">
          <form action={createSchool} className="space-y-5">
            {returnToClasses && (
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
            )}
            <div className="field">
              <label htmlFor="school-name">Name</label>
              <input id="school-name" name="name" required className="input" />
            </div>
            <SubmitButton>Add school</SubmitButton>
          </form>
        </Panel>

        <Panel
          title="School directory"
          description={`${schools.length} active school${schools.length === 1 ? '' : 's'}`}
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
              Search school name
              <input className="input" type="search" name="q" defaultValue={search} />
            </label>
            <button type="submit" className={buttonClasses({ variant: 'secondary' })}>
              Search
            </button>
          </form>
          {schools.length === 0 ? (
            <div className="empty-state">
              <School className="size-6" aria-hidden="true" />
              <p>No schools yet.</p>
            </div>
          ) : (
            <>
              <p className="mb-3 text-xs font-medium text-slate-500 sm:hidden">
                Scroll sideways to view all columns and actions.
              </p>
              <div className="table-scroll relative">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>School</th>
                      <th>Teachers</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {schools.map((school) => (
                      <tr key={school.id}>
                        <td className="font-semibold text-slate-900">
                          <Link className="underline" href={'/admin/schools/' + school.id}>
                            {school.name}
                          </Link>
                        </td>
                        <td>{school._count.teachers}</td>
                        <td>
                          <div className="flex justify-end gap-2">
                            <Link
                              href={`/admin/schools/${school.id}`}
                              className={buttonClasses({ size: 'sm' })}
                            >
                              Open
                            </Link>
                            <Link
                              href={`/admin/schools/${school.id}/edit`}
                              aria-label={`Edit ${school.name}`}
                              className={buttonClasses({ variant: 'ghost', size: 'sm' })}
                            >
                              <Pencil className="size-3.5" aria-hidden="true" /> Edit
                            </Link>
                            <form action={softDeleteSchool}>
                              <input type="hidden" name="id" value={school.id} />
                              <SubmitButton
                                variant="danger"
                                size="sm"
                                aria-label={`Deactivate ${school.name}`}
                              >
                                Deactivate
                              </SubmitButton>
                            </form>
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
