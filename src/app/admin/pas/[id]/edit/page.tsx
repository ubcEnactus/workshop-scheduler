import Link from 'next/link'
import { notFound } from 'next/navigation'

import { FormError } from '@/components/form-error'
import { SubmitButton } from '@/components/submit-button'
import { buttonClasses } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'

import { updatePA } from '../../actions'

export default async function EditPAPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  await requireRole('ADMIN')
  const { id } = await params
  const { error } = await searchParams
  const pa = await prisma.user.findFirst({ where: { id, role: 'PA', deletedAt: null } })
  if (!pa) notFound()

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="PAs"
        title="Edit PA"
        description={`Update the account details for ${pa.name ?? pa.email}.`}
        actions={
          <Link href="/admin/pas" className={buttonClasses({ variant: 'secondary' })}>
            Back to PAs
          </Link>
        }
      />
      <Link href={`/admin/pas/${pa.id}/availability`} className="text-sm underline">View availability</Link>
      <FormError message={error} />
      <Panel
        title="PA details"
        description="The email address controls who can request access to this account."
        className="max-w-2xl"
      >
        <form action={updatePA} className="space-y-5">
          <input type="hidden" name="id" value={pa.id} />
          <div className="field">
            <label htmlFor="pa-name">Name</label>
            <input
              id="pa-name"
              name="name"
              defaultValue={pa.name ?? ''}
              required
              className="input"
            />
          </div>
          <div className="field">
            <label htmlFor="pa-email">Email</label>
            <input
              id="pa-email"
              name="email"
              type="email"
              defaultValue={pa.email}
              required
              className="input"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton>Save changes</SubmitButton>
            <Link href="/admin/pas" className={buttonClasses({ variant: 'ghost' })}>
              Cancel
            </Link>
          </div>
        </form>
      </Panel>
    </main>
  )
}
