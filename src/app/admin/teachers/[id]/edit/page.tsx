import Link from 'next/link'
import { notFound } from 'next/navigation'

import { FormError } from '@/components/form-error'
import { SubmitButton } from '@/components/submit-button'
import { buttonClasses } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { parseSchedulingContext, schedulingHref } from '@/lib/scheduling/navigation'

import { updateTeacher } from '../../actions'

export default async function EditTeacherPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requireRole('ADMIN')
  const { id } = await params
  const query = await searchParams
  const { error } = query
  const context = parseSchedulingContext(query)
  const [teacher, schools] = await Promise.all([
    prisma.user.findFirst({
      where: { id, role: 'TEACHER', deletedAt: null },
      include: {
        classesTaught: {
          orderBy: { name: 'asc' },
          include: {
            school: true,
            _count: { select: { classWorkshops: true } },
          },
        },
      },
    }),
    prisma.school.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } }),
  ])
  if (!teacher) notFound()

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Teachers"
        title="Edit teacher"
        description={`Update the account and school assignment for ${teacher.name ?? teacher.email}.`}
        actions={
          <Link
            href={schedulingHref('/admin/classes', context)}
            className={buttonClasses({ variant: 'secondary' })}
          >
            Back to teachers
          </Link>
        }
      />
      <FormError message={error} />
      <Panel
        title="Teacher details"
        description="Edit the contact details. A school change is available until availability or workshop history has been recorded."
        className="max-w-2xl"
      >
        <form action={updateTeacher} className="space-y-5">
          <input type="hidden" name="directory" value="combined" />
          {Object.entries(context).map(([key, value]) => (
            <input
              key={key}
              type="hidden"
              name={key === 'schoolId' ? 'returnSchoolId' : key}
              value={value}
            />
          ))}
          <input type="hidden" name="id" value={teacher.id} />
          <div className="field">
            <label htmlFor="teacher-name">Name</label>
            <input
              id="teacher-name"
              name="name"
              defaultValue={teacher.name ?? ''}
              required
              className="input"
            />
          </div>
          <div className="field">
            <label htmlFor="teacher-email">Email</label>
            <input
              id="teacher-email"
              name="email"
              type="email"
              defaultValue={teacher.email}
              required
              className="input"
            />
          </div>
          <div className="field">
            <label htmlFor="teacher-school">School</label>
            <select
              id="teacher-school"
              name="schoolId"
              defaultValue={teacher.schoolId ?? ''}
              required
              className="input"
            >
              <option value="">Select a school…</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton>Save</SubmitButton>
            <Link
              href={schedulingHref('/admin/classes', context)}
              className={buttonClasses({ variant: 'ghost' })}
            >
              Cancel
            </Link>
          </div>
        </form>
      </Panel>
      <Panel
        title="Availability & workshops"
        description="Manage this teacher’s weekly availability, exceptions, defaults, and run enrollment."
      >
        <Link href={'/admin/teachers/' + teacher.id} className={buttonClasses()}>
          Open teacher schedule
        </Link>
      </Panel>
    </main>
  )
}
