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

import { createTeacher, softDeleteTeacher } from './actions'

export default async function TeachersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireRole('ADMIN')
  const { error } = await searchParams
  const [teachers, schools] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'TEACHER', deletedAt: null },
      include: { school: true },
      orderBy: { name: 'asc' },
    }),
    prisma.school.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } }),
  ])

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="People"
        title="Teachers"
        description="Manage teacher accounts and connect each teacher to their school."
      />
      <FormError message={error} />

      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(19rem,0.75fr)_minmax(0,1.25fr)]">
        <Panel
          title="Add teacher"
          description="Add a teacher before they request a magic sign-in link."
        >
          {schools.length === 0 && (
            <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Add a school before adding a teacher.{' '}
              <Link href="/admin/schools" className="font-semibold underline">
                Go to schools
              </Link>
              .
            </div>
          )}
          <form action={createTeacher} className="space-y-5">
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
              <select id="teacher-school" name="schoolId" required className="input min-w-0">
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
                          <p className="font-semibold text-slate-900">{teacher.name}</p>
                          <p className="text-xs text-slate-500">{teacher.email}</p>
                        </td>
                        <td>{teacher.school?.name ?? '—'}</td>
                        <td>
                          <StatusBadge status="active" />
                        </td>
                        <td>
                          <div className="flex justify-end gap-2">
                            <Link
                              href={`/admin/teachers/${teacher.id}/edit`}
                              aria-label={`Edit ${teacher.name ?? teacher.email}`}
                              className={buttonClasses({ variant: 'ghost', size: 'sm' })}
                            >
                              <Pencil className="size-3.5" aria-hidden="true" /> Edit
                            </Link>
                            <form action={softDeleteTeacher}>
                              <input type="hidden" name="id" value={teacher.id} />
                              <SubmitButton
                                variant="danger"
                                size="sm"
                                aria-label={`Delete ${teacher.name ?? teacher.email}`}
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
