import Link from 'next/link'
import { notFound } from 'next/navigation'

import { FormError } from '@/components/form-error'
import { SubmitButton } from '@/components/submit-button'
import { buttonClasses } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'

import { updateTeacher } from '../../actions'

export default async function EditTeacherPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  await requireRole('ADMIN')
  const { id } = await params
  const { error } = await searchParams
  const [teacher, schools] = await Promise.all([
    prisma.user.findFirst({ where: { id, role: 'TEACHER', deletedAt: null } }),
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
          <Link href="/admin/teachers" className={buttonClasses({ variant: 'secondary' })}>
            Back to teachers
          </Link>
        }
      />
      <FormError message={error} />
      <Panel
        title="Teacher details"
        description="Changing a teacher’s school may require moving or removing their classes first."
        className="max-w-2xl"
      >
        <form action={updateTeacher} className="space-y-5">
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
            <Link href="/admin/teachers" className={buttonClasses({ variant: 'ghost' })}>
              Cancel
            </Link>
          </div>
        </form>
      </Panel>
    </main>
  )
}
