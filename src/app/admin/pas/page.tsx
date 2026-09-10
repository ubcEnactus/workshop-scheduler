import Link from 'next/link'
import { Pencil, UserRoundCheck } from 'lucide-react'

import { FormError } from '@/components/form-error'
import { SubmitButton } from '@/components/submit-button'
import { buttonClasses } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { StatusBadge } from '@/components/ui/status-badge'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'

import { createPA, softDeletePA } from './actions'

export default async function PAsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireRole('ADMIN')
  const { error } = await searchParams
  const pas = await prisma.user.findMany({
    where: { role: 'PA', deletedAt: null },
    orderBy: [{ name: 'asc' }, { email: 'asc' }],
  })

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="People"
        title="PAs"
        description="Manage PA access before volunteers request a magic sign-in link."
      />
      <FormError message={error} />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(19rem,0.75fr)_minmax(0,1.25fr)]">
        <Panel
          title="Add PA"
          description="Removed accounts cannot sign in, but their scheduling history is retained."
        >
          <form action={createPA} className="space-y-5">
            <div className="field">
              <label htmlFor="pa-name">Name</label>
              <input id="pa-name" name="name" required className="input" />
            </div>
            <div className="field">
              <label htmlFor="pa-email">Email</label>
              <input id="pa-email" name="email" type="email" required className="input" />
            </div>
            <SubmitButton>Add PA</SubmitButton>
          </form>
        </Panel>

        <Panel
          title="PA directory"
          description={`${pas.length} active PA${pas.length === 1 ? '' : 's'}`}
        >
          {pas.length === 0 ? (
            <div className="empty-state">
              <UserRoundCheck className="size-6" aria-hidden="true" />
              <p>No PAs yet.</p>
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
                      <th>PA</th>
                      <th>Status</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pas.map((pa) => (
                      <tr key={pa.id}>
                        <td>
                          <p className="font-semibold text-slate-900">{pa.name ?? 'Unnamed PA'}</p>
                          <p className="text-xs text-slate-500">{pa.email}</p>
                        </td>
                        <td>
                          <StatusBadge status="active" />
                        </td>
                        <td>
                          <div className="flex justify-end gap-2">
                            <Link
                              href={`/admin/pas/${pa.id}/edit`}
                              aria-label={`Edit ${pa.name ?? pa.email}`}
                              className={buttonClasses({ variant: 'ghost', size: 'sm' })}
                            >
                              <Pencil className="size-3.5" aria-hidden="true" /> Edit
                            </Link>
                            <form action={softDeletePA}>
                              <input type="hidden" name="id" value={pa.id} />
                              <SubmitButton
                                variant="danger"
                                size="sm"
                                aria-label={`Remove ${pa.name ?? pa.email}`}
                              >
                                Remove
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
