import type { ScheduleSnapshot, ScheduledWorkshop } from '@/lib/scheduling/eligibility'
import { stageWorkshopChange } from '@/app/admin/workshops/changes/actions'
import { vancouverDateKey, vancouverMinuteOfDay } from '@/lib/time'
import { SubmitButton } from './submit-button'
function Fields({ workshop, kind }: { workshop: ScheduledWorkshop; kind: string }) {
  return (
    <>
      <input type="hidden" name="id" value={workshop.id} />
      <input type="hidden" name="version" value={workshop.version} />
      <input type="hidden" name="kind" value={kind} />
      <label className="block" htmlFor={kind + '-reason'}>
        Reason
      </label>
      <textarea
        className="w-full rounded border p-2"
        id={kind + '-reason'}
        name="reason"
        required
        maxLength={1000}
      />
    </>
  )
}
function clock(d: Date) {
  const m = vancouverMinuteOfDay(d)
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')
}
export function WorkshopChanges({
  workshop,
  snapshot,
}: {
  workshop: ScheduledWorkshop
  snapshot: ScheduleSnapshot
}) {
  if (!['DRAFT', 'PUBLISHED'].includes(workshop.status)) return null
  return (
    <section className="space-y-5 border-t pt-6">
      <h2 className="text-xl font-semibold">Change workshop</h2>
      <p>Review changes before applying. Include a reason for the history.</p>
      {workshop.assignments.length > 0 && (
        <details>
          <summary className="cursor-pointer font-medium">Replace a PA</summary>
          <form action={stageWorkshopChange} className="mt-3 space-y-3">
            <label className="block">
              Assigned PA{' '}
              <select
                aria-label="Assigned PA"
                name="oldPaId"
                required
                className="w-full rounded border p-2"
              >
                {workshop.assignments.map((a) => (
                  <option key={a.paId} value={a.paId}>
                    {snapshot.pas.find((p) => p.id === a.paId)?.name ??
                      snapshot.pas.find((p) => p.id === a.paId)?.email ??
                      'Inactive PA'}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Replacement PA{' '}
              <select
                aria-label="Replacement PA"
                name="newPaId"
                required
                className="w-full rounded border p-2"
                defaultValue=""
              >
                <option value="" disabled>
                  Choose a PA
                </option>
                {snapshot.pas
                  .filter((p) => !workshop.assignments.some((a) => a.paId === p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name ?? p.email}
                    </option>
                  ))}
              </select>
            </label>
            <Fields workshop={workshop} kind="REPLACE" />
            <SubmitButton>Review replacement</SubmitButton>
          </form>
        </details>
      )}
      <details>
        <summary className="cursor-pointer font-medium">Reschedule workshop</summary>
        <form action={stageWorkshopChange} className="mt-3 space-y-3">
          <label className="block">
            New date{' '}
            <input
              aria-label="New date"
              type="date"
              name="date"
              defaultValue={vancouverDateKey(workshop.scheduledStart)}
              required
              className="rounded border p-2"
            />
          </label>
          <label className="block">
            New start time{' '}
            <input
              aria-label="New start time"
              type="time"
              name="startTime"
              defaultValue={clock(workshop.scheduledStart)}
              required
              className="rounded border p-2"
            />
          </label>
          <label className="block">
            New end time{' '}
            <input
              aria-label="New end time"
              type="time"
              name="endTime"
              defaultValue={clock(workshop.scheduledEnd)}
              required
              className="rounded border p-2"
            />
          </label>
          <Fields workshop={workshop} kind="RESCHEDULE" />
          <SubmitButton>Review reschedule</SubmitButton>
        </form>
      </details>
      <details>
        <summary className="cursor-pointer font-medium">Cancel workshop</summary>
        <form action={stageWorkshopChange} className="mt-3 space-y-3">
          <Fields workshop={workshop} kind="CANCEL" />
          <SubmitButton>Review cancellation</SubmitButton>
        </form>
      </details>
      {workshop.status === 'PUBLISHED' && workshop.scheduledEnd.getTime() <= Date.now() && (
        <details>
          <summary className="cursor-pointer font-medium">Record completion</summary>
          <form action={stageWorkshopChange} className="mt-3 space-y-3">
            <Fields workshop={workshop} kind="COMPLETE" />
            <SubmitButton>Review completion</SubmitButton>
          </form>
        </details>
      )}
    </section>
  )
}
