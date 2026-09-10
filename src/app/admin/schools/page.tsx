import Link from 'next/link'
import { Pencil, School } from 'lucide-react'

import { FormError } from '@/components/form-error'
import { SubmitButton } from '@/components/submit-button'
import { buttonClasses } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { StatusBadge } from '@/components/ui/status-badge'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'

import { createSchool, softDeleteSchool } from './actions'

export default async function SchoolsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireRole('ADMIN')
  const { error } = await searchParams
  const schools = await prisma.school.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
  })

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Program setup"
        title="Schools"
        description="Manage the partner schools and districts in your workshop program."
      />
      <FormError message={error} />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(18rem,0.7fr)_minmax(0,1.3fr)]">
        <Panel
          title="Add school"
          description="Create a school before adding its teachers and classes."
        >
          <form action={createSchool} className="space-y-5">
            <div className="field">
              <label htmlFor="school-name">Name</label>
              <input id="school-name" name="name" required className="input" />
            </div>
            <div className="field">
              <label htmlFor="school-district">District</label>
              <input id="school-district" name="district" required className="input" />
            </div>
            <SubmitButton>Add school</SubmitButton>
          </form>
        </Panel>

        <Panel
          title="School directory"
          description={`${schools.length} active school${schools.length === 1 ? '' : 's'}`}
        >
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
                      <th>District</th>
                      <th>Status</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {schools.map((school) => (
                      <tr key={school.id}>
                        <td className="font-semibold text-slate-900">{school.name}</td>
                        <td>{school.district}</td>
                        <td>
                          <StatusBadge status="active" />
                        </td>
                        <td>
                          <div className="flex justify-end gap-2">
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
                                aria-label={`Delete ${school.name}`}
                              >
                                Delete
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
