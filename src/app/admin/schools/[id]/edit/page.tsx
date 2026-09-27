import Link from 'next/link'
import { notFound } from 'next/navigation'

import { FormError } from '@/components/form-error'
import { SubmitButton } from '@/components/submit-button'
import { buttonClasses } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'

import { updateSchool } from '../../actions'

export default async function EditSchoolPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  await requireRole('ADMIN')
  const { id } = await params
  const { error } = await searchParams
  const school = await prisma.school.findFirst({ where: { id, deletedAt: null } })
  if (!school) notFound()

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Schools"
        title="Edit school"
        description={`Update ${school.name}’s name.`}
        actions={
          <Link href="/admin/schools" className={buttonClasses({ variant: 'secondary' })}>
            Back to schools
          </Link>
        }
      />
      <FormError message={error} />
      <Panel
        title="School details"
        description="These details appear throughout teacher and workshop planning."
        className="max-w-2xl"
      >
        <form action={updateSchool} className="space-y-5">
          <input type="hidden" name="id" value={school.id} />
          <div className="field">
            <label htmlFor="school-name">Name</label>
            <input
              id="school-name"
              name="name"
              defaultValue={school.name}
              required
              className="input"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton>Save</SubmitButton>
            <Link href="/admin/schools" className={buttonClasses({ variant: 'ghost' })}>
              Cancel
            </Link>
          </div>
        </form>
      </Panel>
    </main>
  )
}
