import Link from 'next/link'
import { parseSchedulingContext, schedulingHref } from '@/lib/scheduling/navigation'
import { BookOpen, Pencil } from 'lucide-react'

import { ClassDefaults } from '@/components/class-defaults'
import { FormError } from '@/components/form-error'
import { SubmitButton } from '@/components/submit-button'
import { buttonClasses } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'

import { createClassSection, deleteClassSection } from './actions'

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requireRole('ADMIN')
  const query = await searchParams
  const { error } = query
  const context = parseSchedulingContext(query)
  const [classes, teachers] = await Promise.all([
    prisma.classSection.findMany({
      where: { school: { deletedAt: null }, teacher: { deletedAt: null } },
      include: {
        teacher: true,
        school: true,
        meetings: { orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.user.findMany({
      where: { role: 'TEACHER', deletedAt: null, school: { deletedAt: null } },
      include: { school: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Program setup"
        title="Classes"
        description="Set each class’s teacher, monthly workshop defaults, and weekly availability."
      />
      <FormError message={error} />

      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(21rem,0.8fr)_minmax(0,1.2fr)]">
        <Panel
          title="Add class"
          description="Defaults are used when planning new workshops and can be changed later."
        >
          {teachers.length === 0 && (
            <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Add a teacher before adding a class.{' '}
              <Link href="/admin/teachers" className="font-semibold underline">
                Go to teachers
              </Link>
              .
            </div>
          )}
          <form action={createClassSection} className="space-y-5">
            <div className="field">
              <label htmlFor="class-name">Class name</label>
              <input
                id="class-name"
                name="name"
                required
                placeholder="e.g. Period 3 Biology"
                className="input"
              />
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="class-subject">Subject (optional)</label>
                <input id="class-subject" name="subject" className="input" />
              </div>
              <div className="field">
                <label htmlFor="class-grade">Grade (optional)</label>
                <input id="class-grade" name="grade" className="input" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="class-teacher">Teacher</label>
              <select id="class-teacher" name="teacherId" required className="input min-w-0">
                <option value="">Select a teacher…</option>
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.name} · {teacher.school?.name}
                  </option>
                ))}
              </select>
            </div>
            <ClassDefaults />
            <SubmitButton disabled={teachers.length === 0}>Add class</SubmitButton>
          </form>
        </Panel>

        <Panel
          title="Class directory"
          description={`${classes.length} active class${classes.length === 1 ? '' : 'es'}`}
        >
          {classes.length === 0 ? (
            <div className="empty-state">
              <BookOpen className="size-6" aria-hidden="true" />
              <p>No classes yet.</p>
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
                      <th>Class</th>
                      <th>Teacher and school</th>
                      <th>Availability</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {classes.map((cls) => (
                      <tr key={cls.id}>
                        <td>
                          <p className="font-semibold text-slate-900">{cls.name}</p>
                          <p className="text-xs text-slate-500">
                            {[cls.subject, cls.grade ? `Grade ${cls.grade}` : null]
                              .filter(Boolean)
                              .join(' · ') || 'No subject or grade set'}
                          </p>
                        </td>
                        <td>
                          <p className="font-medium text-slate-700">{cls.teacher.name}</p>
                          <p className="text-xs text-slate-500">{cls.school.name}</p>
                        </td>
                        <td>
                          {cls.meetings.length} availability block
                          {cls.meetings.length !== 1 ? 's' : ''}
                        </td>
                        <td>
                          <div className="flex justify-end gap-2">
                            <Link
                              href={schedulingHref('/admin/classes/' + cls.id + '/edit', context)}
                              aria-label={`Edit ${cls.name}`}
                              className={buttonClasses({ variant: 'ghost', size: 'sm' })}
                            >
                              <Pencil className="size-3.5" aria-hidden="true" /> Edit
                            </Link>
                            <form action={deleteClassSection}>
                              <input type="hidden" name="id" value={cls.id} />
                              <SubmitButton
                                variant="danger"
                                size="sm"
                                aria-label={`Delete ${cls.name}`}
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
