import { ShieldCheck } from 'lucide-react'

import { FormError } from '@/components/form-error'
import { SubmitButton } from '@/components/submit-button'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { StatusBadge } from '@/components/ui/status-badge'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'

import { createAdmin } from './actions'

export default async function AdminsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>
}) {
  const currentAdmin = await requireRole('ADMIN')
  const { error, saved } = await searchParams
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', deletedAt: null },
    orderBy: [{ name: 'asc' }, { email: 'asc' }],
    select: { id: true, name: true, email: true },
  })

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="People"
        title="Admins"
        description="Add trusted coordinators who can manage the full workshop schedule and invite other accounts."
      />
      <FormError message={error} />
      {saved === '1' ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          Admin added. They can now request a one-time sign-in link with their email address.
        </p>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(19rem,0.75fr)_minmax(0,1.25fr)]">
        <Panel
          title="Add admin"
          description="Admins have full access to people, workshops, staffing, publishing, and account setup."
        >
          <form action={createAdmin} className="space-y-5">
            <div className="field">
              <label htmlFor="admin-name">Name</label>
              <input id="admin-name" name="name" required className="input" />
            </div>
            <div className="field">
              <label htmlFor="admin-email">Email</label>
              <input id="admin-email" name="email" type="email" required className="input" />
            </div>
            <SubmitButton>Add admin</SubmitButton>
          </form>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            Adding an admin grants access but does not send an email. Share the sign-in page with
            them so they can request their secure link.
          </p>
        </Panel>

        <Panel
          title="Admin directory"
          description={`${admins.length} active admin${admins.length === 1 ? '' : 's'}`}
        >
          {admins.length === 0 ? (
            <div className="empty-state">
              <ShieldCheck className="size-6" aria-hidden="true" />
              <p>No admins found.</p>
            </div>
          ) : (
            <div className="table-scroll relative">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Admin</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map((admin) => (
                    <tr key={admin.id}>
                      <td>
                        <p className="font-semibold text-slate-900">
                          {admin.name ?? 'Unnamed admin'}
                          {admin.id === currentAdmin.id ? (
                            <span className="ml-2 text-xs font-medium text-slate-500">You</span>
                          ) : null}
                        </p>
                        <p className="text-xs text-slate-500">{admin.email}</p>
                      </td>
                      <td>
                        <StatusBadge status="active" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </main>
  )
}
