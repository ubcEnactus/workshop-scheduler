import Link from 'next/link'
import { parseSchedulingContext, schedulingHref } from '@/lib/scheduling/navigation'
import { ClassDefaults } from '@/components/class-defaults'
import { FormError } from '@/components/form-error'
import { SubmitButton } from '@/components/submit-button'
import { buttonClasses } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { createClassSection, deleteClassSection } from './actions'
import { softDeleteTeacher } from '../teachers/actions'

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requireRole('ADMIN')
  const query = await searchParams
  const context = parseSchedulingContext(query)
  const [classes, teachers] = await Promise.all([
    prisma.classSection.findMany({
      where: { school: { deletedAt: null }, teacher: { role: 'TEACHER', deletedAt: null } },
      include: { teacher: true, school: true, _count: { select: { meetings: true } } },
      orderBy: [{ school: { name: 'asc' } }, { name: 'asc' }],
    }),
    prisma.user.findMany({
      where: { role: 'TEACHER', deletedAt: null },
      include: { school: true, _count: { select: { classesTaught: true } } },
      orderBy: { name: 'asc' },
    }),
  ])
  const availableTeachers = teachers.filter((t) => t.school && !t.school.deletedAt)
  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Saved contacts and classes"
        title="Classes & teachers"
        description="Everything saved from your bookings, together in one place. No setup is needed before booking."
        actions={
          <Link href={schedulingHref('/admin/workshops/new', context)} className={buttonClasses()}>
            Book workshop
          </Link>
        }
      />
      <FormError message={query.error} />
      <Panel
        title="Classes"
        description={classes.length + ' saved classes · book again or update their details.'}
      >
        {!classes.length ? (
          <div className="empty-state">
            <p>No classes yet. Book a workshop to add its school, teacher and class together.</p>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {classes.map((cls) => (
              <article key={cls.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 break-words">
                    <h3 className="font-semibold text-slate-900">{cls.name}</h3>
                    <p className="mt-1 text-sm text-slate-600">{cls.school.name}</p>
                    <Link
                      className="mt-2 inline-block text-sm underline"
                      href={schedulingHref('/admin/teachers/' + cls.teacherId + '/edit', context)}
                    >
                      {cls.teacher.name ?? cls.teacher.email}
                    </Link>
                    <p className="text-xs text-slate-500">{cls.teacher.email}</p>
                  </div>
                  <Link
                    className={buttonClasses({ variant: 'secondary', size: 'sm' })}
                    aria-label={'Book ' + cls.name}
                    href={schedulingHref('/admin/workshops/new', {
                      ...context,
                      schoolId: cls.schoolId,
                      classSectionId: cls.id,
                    })}
                  >
                    Book again
                  </Link>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  {cls._count.meetings
                    ? cls._count.meetings + ' weekly availability blocks'
                    : 'Book a date directly; weekly availability is optional.'}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  <Link
                    href={schedulingHref('/admin/classes/' + cls.id + '/edit', context)}
                    aria-label={'Edit ' + cls.name}
                    className={buttonClasses({ variant: 'ghost', size: 'sm' })}
                  >
                    Edit class
                  </Link>
                  <form action={deleteClassSection}>
                    <input type="hidden" name="id" value={cls.id} />
                    <SubmitButton variant="danger" size="sm" aria-label={'Delete ' + cls.name}>
                      Delete
                    </SubmitButton>
                  </form>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>
      <Panel
        title="Teachers"
        description="Teacher contacts and access, including teachers without a class yet."
      >
        {!teachers.length ? (
          <p className="text-sm text-slate-600">
            Teacher details are saved when you book your first workshop.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {teachers.map((teacher) => (
              <li
                key={teacher.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 break-words">
                  <p className="font-semibold">{teacher.name ?? teacher.email}</p>
                  <p className="text-sm text-slate-600">{teacher.email}</p>
                  <p className="text-xs text-slate-500">
                    {teacher.school?.name ?? 'No school'}
                    {teacher.school?.deletedAt ? ' (removed)' : ''} · {teacher._count.classesTaught}{' '}
                    classes
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={schedulingHref('/admin/teachers/' + teacher.id + '/edit', context)}
                    aria-label={'Edit ' + (teacher.name ?? teacher.email)}
                    className={buttonClasses({ variant: 'ghost', size: 'sm' })}
                  >
                    Edit teacher
                  </Link>
                  {!teacher._count.classesTaught && (
                    <form action={softDeleteTeacher}>
                      <input type="hidden" name="id" value={teacher.id} />
                      <input type="hidden" name="directory" value="combined" />
                      {Object.entries(context).map(([key, value]) => (
                        <input
                          key={key}
                          type="hidden"
                          name={key === 'schoolId' ? 'returnSchoolId' : key}
                          value={value}
                        />
                      ))}
                      <SubmitButton
                        variant="danger"
                        size="sm"
                        aria-label={'Delete ' + (teacher.name ?? teacher.email)}
                      >
                        Delete
                      </SubmitButton>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {availableTeachers.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white p-4" open={!!query.error}>
          <summary className="cursor-pointer text-sm font-semibold">
            Add a class without booking
          </summary>
          <form action={createClassSection} className="mt-4 max-w-2xl space-y-4">
            <label className="field">
              Class name
              <input name="name" required className="input" />
            </label>
            <div className="form-grid">
              <label className="field">
                Subject (optional)
                <input name="subject" className="input" />
              </label>
              <label className="field">
                Grade (optional)
                <input name="grade" className="input" />
              </label>
            </div>
            <label className="field">
              Teacher
              <select name="teacherId" required className="input">
                <option value="">Select a teacher…</option>
                {availableTeachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.school?.name}
                  </option>
                ))}
              </select>
            </label>
            <ClassDefaults />
            <SubmitButton>Add class</SubmitButton>
          </form>
        </details>
      )}
    </main>
  )
}
