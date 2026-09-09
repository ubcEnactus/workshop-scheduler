import Link from 'next/link'
import {
  eligibility,
  staffingProblems,
  type ScheduledWorkshop,
  type ScheduleSnapshot,
} from '@/lib/scheduling/eligibility'
import { vancouverMonthKey } from '@/lib/time'
import { assignPA, removePA, setWorkshopLock, publishWorkshop } from '@/app/admin/staffing/actions'
import { SubmitButton } from './submit-button'

function Identity({ workshop }: { workshop: ScheduledWorkshop }) {
  return (
    <>
      <input type="hidden" name="id" value={workshop.id} />
      <input type="hidden" name="version" value={workshop.version} />
    </>
  )
}
export function WorkshopStaffing({
  workshop,
  snapshot,
}: {
  workshop: ScheduledWorkshop
  snapshot: ScheduleSnapshot
}) {
  const problems = staffingProblems(snapshot, workshop)
  return (
    <section className="space-y-4 border-t pt-6">
      <h2 className="text-xl font-semibold">Staffing</h2>
      <Link
        href={'/admin/staffing?month=' + vancouverMonthKey(workshop.scheduledStart)}
        className="underline"
      >
        Manage monthly quotas and assignment gap
      </Link>
      <p>
        {workshop.assignments.length} assigned · {workshop.minPAs}–{workshop.maxPAs} needed ·{' '}
        {workshop.locked || workshop.status !== 'DRAFT' ? 'Locked' : 'Unlocked'}
      </p>
      {problems.length > 0 && (
        <div className="rounded border p-3">
          <p className="font-medium">Needs review</p>
          <ul className="list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      <ul className="space-y-2">
        {workshop.assignments.map((a) => {
          const pa = snapshot.pas.find((p) => p.id === a.paId)
          return (
            <li
              key={a.paId}
              className="flex flex-wrap items-center justify-between gap-3 rounded border p-3"
            >
              <span>
                {pa?.name ?? pa?.email ?? 'Inactive PA'} · {a.status.toLowerCase()}
              </span>
              {workshop.status === 'DRAFT' && (
                <form action={removePA}>
                  <Identity workshop={workshop} />
                  <input type="hidden" name="paId" value={a.paId} />
                  <SubmitButton>Remove PA</SubmitButton>
                </form>
              )}
            </li>
          )
        })}
      </ul>
      {workshop.status === 'DRAFT' && (
        <>
          <details>
            <summary className="cursor-pointer font-medium">Choose a PA</summary>
            <ul className="mt-3 space-y-3">
              {snapshot.pas
                .filter((pa) => !workshop.assignments.some((a) => a.paId === pa.id))
                .map((pa) => {
                  const reasons = eligibility(snapshot, workshop, pa.id)
                  return (
                    <li key={pa.id} className="rounded border p-3">
                      <p className="font-medium">{pa.name ?? pa.email}</p>
                      {reasons.length ? (
                        <p className="text-sm">{reasons.join(' ')}</p>
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
          </details>
          <form action={setWorkshopLock}>
            <Identity workshop={workshop} />
            <input type="hidden" name="locked" value={workshop.locked ? 'false' : 'true'} />
            <SubmitButton>{workshop.locked ? 'Unlock draft' : 'Lock draft'}</SubmitButton>
          </form>
          <p className="text-sm">
            Locks protect drafts from automatic staffing. Manual assignments are protected too.
            Admins can still edit locked drafts.
          </p>
          <form action={publishWorkshop}>
            <Identity workshop={workshop} />
            <SubmitButton>Publish workshop</SubmitButton>
          </form>
        </>
      )}
    </section>
  )
}
