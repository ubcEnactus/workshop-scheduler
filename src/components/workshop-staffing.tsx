import Link from 'next/link'
import { schedulingHref, type SchedulingContext } from '@/lib/scheduling/navigation'
import {
  eligibility,
  staffingProblems,
  type ScheduledWorkshop,
  type ScheduleSnapshot,
} from '@/lib/scheduling/eligibility'
import { vancouverMonthKey } from '@/lib/time'
import { assignPA, removePA, setWorkshopLock, publishWorkshop } from '@/app/admin/staffing/actions'
import { SubmitButton } from './submit-button'
import { AlertTriangle, LockKeyhole, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { StatusBadge } from '@/components/ui/status-badge'

function Identity({
  workshop,
  context,
}: {
  workshop: ScheduledWorkshop
  context?: SchedulingContext
}) {
  return (
    <>
      <input type="hidden" name="id" value={workshop.id} />
      <input type="hidden" name="version" value={workshop.version} />
      {context &&
        Object.entries(context).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
    </>
  )
}
export function WorkshopStaffing({
  workshop,
  snapshot,
  context,
}: {
  workshop: ScheduledWorkshop
  snapshot: ScheduleSnapshot
  context?: SchedulingContext
}) {
  const problems = ['DRAFT', 'PUBLISHED'].includes(workshop.status)
    ? staffingProblems(snapshot, workshop)
    : []
  const availablePAs = snapshot.pas.filter(
    (pa) => !workshop.assignments.some((assignment) => assignment.paId === pa.id)
  )
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
            <Users className="size-5 text-[#1e2a4a]" /> Staffing
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {workshop.assignments.length} assigned · {workshop.minPAs}–{workshop.maxPAs} needed
          </p>
        </div>
        <StatusBadge
          status={workshop.locked || workshop.status !== 'DRAFT' ? 'LOCKED' : 'UNLOCKED'}
        />
      </div>
      <Link
        href={schedulingHref(
          '/admin/staffing',
          context ?? { month: vancouverMonthKey(workshop.scheduledStart) }
        )}
        className="inline-flex text-sm font-semibold text-[#1e2a4a] hover:underline"
      >
        Manage monthly quotas and assignment gap
      </Link>
      {problems.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4" /> Needs review
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {workshop.assignments.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {workshop.assignments.map((a) => {
            const pa = snapshot.pas.find((p) => p.id === a.paId)
            return (
              <li
                key={a.paId}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <span className="flex items-center gap-3 text-sm font-medium text-slate-800">
                  <span className="flex size-8 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-[#1e2a4a]">
                    {(pa?.name ?? pa?.email ?? 'I').charAt(0).toUpperCase()}
                  </span>
                  {pa?.name ?? pa?.email ?? 'Inactive PA'}
                  <StatusBadge status={a.status} />
                </span>
                {workshop.status === 'DRAFT' && (
                  <form action={removePA}>
                    <Identity workshop={workshop} context={context} />
                    <input type="hidden" name="paId" value={a.paId} />
                    <SubmitButton>Remove PA</SubmitButton>
                  </form>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {workshop.assignments.length === 0 && (
        <div className="empty-state py-6">
          <Users className="mx-auto size-7 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">No PAs assigned yet.</p>
        </div>
      )}
      {workshop.status === 'DRAFT' && (
        <>
          <details className="group rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-slate-800">
              <UserPlus className="size-4" /> Choose a PA
            </summary>
            {availablePAs.length > 0 ? (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {availablePAs.map((pa) => {
                  const reasons = eligibility(snapshot, workshop, pa.id)
                  return (
                    <li key={pa.id} className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-sm font-semibold text-slate-900">{pa.name ?? pa.email}</p>
                      {reasons.length ? (
                        <p className="mt-1 text-xs leading-5 text-slate-500">{reasons.join(' ')}</p>
                      ) : (
                        <form action={assignPA} className="mt-2">
                          <Identity workshop={workshop} />
                          <input type="hidden" name="paId" value={pa.id} />
                          <SubmitButton>Assign {pa.name ?? pa.email}</SubmitButton>
                        </form>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="mt-4 rounded-lg border border-dashed border-slate-200 bg-white px-4 py-5 text-center text-sm text-slate-500">
                No other active PAs are available to add.
              </p>
            )}
          </details>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <form
              action={setWorkshopLock}
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <Identity workshop={workshop} />
              <input type="hidden" name="locked" value={workshop.locked ? 'false' : 'true'} />
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <LockKeyhole className="size-4" /> Draft protection
              </span>
              <SubmitButton>{workshop.locked ? 'Unlock draft' : 'Lock draft'}</SubmitButton>
            </form>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Locks protect drafts from automatic staffing. Manual assignments are protected too.
              Admins can still edit locked drafts.
            </p>
          </div>
          <form
            action={publishWorkshop}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 p-4"
          >
            <Identity workshop={workshop} />
            <span className="flex items-center gap-2 text-sm font-semibold text-green-800">
              <ShieldCheck className="size-4" /> Ready for the official schedule?
            </span>
            <SubmitButton disabled={problems.length > 0}>Publish workshop</SubmitButton>
          </form>
        </>
      )}
    </section>
  )
}
