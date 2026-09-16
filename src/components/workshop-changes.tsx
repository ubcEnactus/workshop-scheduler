import type { ScheduleSnapshot, ScheduledWorkshop } from '@/lib/scheduling/eligibility'
import { stageWorkshopChange } from '@/app/admin/workshops/changes/actions'
import { vancouverDateKey, vancouverMinuteOfDay } from '@/lib/time'
import type { SchedulingContext } from '@/lib/scheduling/navigation'
import { SubmitButton } from './submit-button'
import { Ban, CalendarClock, CheckCircle2, RefreshCw } from 'lucide-react'
function Fields({
  workshop,
  kind,
  context,
}: {
  workshop: ScheduledWorkshop
  kind: string
  context?: SchedulingContext
}) {
  return (
    <>
      <input type="hidden" name="id" value={workshop.id} />
      <input type="hidden" name="version" value={workshop.version} />
      <input type="hidden" name="kind" value={kind} />
      {context &&
        Object.entries(context).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
      <label className="block text-sm font-medium text-slate-700" htmlFor={kind + '-reason'}>
        Reason
      </label>
      <textarea
        className="input min-h-24 resize-y"
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
  context,
}: {
  workshop: ScheduledWorkshop
  snapshot: ScheduleSnapshot
  context?: SchedulingContext
}) {
  if (!['DRAFT', 'PUBLISHED'].includes(workshop.status)) return null
  const optionClass =
    'group rounded-xl border border-slate-200 bg-white p-4 open:border-slate-300 open:shadow-sm'
  const summaryClass =
    'flex cursor-pointer list-none items-center gap-3 text-sm font-semibold text-slate-800'
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">Change workshop</h2>
        <p className="mt-1 text-sm text-slate-500">
          Review changes before applying. Include a reason for the history.
        </p>
      </div>
      {workshop.assignments.length > 0 && (
        <details className={optionClass}>
          <summary className={summaryClass}>
            <RefreshCw className="size-4 text-blue-600" /> Replace a PA
          </summary>
          <form
            action={stageWorkshopChange}
            className="mt-4 space-y-3 border-t border-slate-100 pt-4"
          >
            <label className="field">
              Assigned PA{' '}
              <select aria-label="Assigned PA" name="oldPaId" required className="input">
                {workshop.assignments.map((a) => (
                  <option key={a.paId} value={a.paId}>
                    {snapshot.pas.find((p) => p.id === a.paId)?.name ??
                      snapshot.pas.find((p) => p.id === a.paId)?.email ??
                      'Inactive PA'}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Replacement PA{' '}
              <select
                aria-label="Replacement PA"
                name="newPaId"
                required
                className="input"
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
            <Fields workshop={workshop} kind="REPLACE" context={context} />
            <SubmitButton>Review replacement</SubmitButton>
          </form>
        </details>
      )}
      <details className={optionClass}>
        <summary className={summaryClass}>
          <CalendarClock className="size-4 text-amber-600" /> Reschedule workshop
        </summary>
        <form
          action={stageWorkshopChange}
          className="mt-4 space-y-3 border-t border-slate-100 pt-4"
        >
          <div className="form-grid">
            <label className="field">
              New date{' '}
              <input
                aria-label="New date"
                type="date"
                name="date"
                defaultValue={vancouverDateKey(workshop.scheduledStart)}
                required
                className="input"
              />
            </label>
            <label className="field">
              New start time{' '}
              <input
                aria-label="New start time"
                type="time"
                name="startTime"
                defaultValue={clock(workshop.scheduledStart)}
                required
                className="input"
              />
            </label>
            <label className="field">
              New end time{' '}
              <input
                aria-label="New end time"
                type="time"
                name="endTime"
                defaultValue={clock(workshop.scheduledEnd)}
                required
                className="input"
              />
            </label>
          </div>
          <Fields workshop={workshop} kind="RESCHEDULE" context={context} />
          <SubmitButton>Review reschedule</SubmitButton>
        </form>
      </details>
      <details className={optionClass}>
        <summary className={summaryClass}>
          <Ban className="size-4 text-red-500" /> Cancel workshop
        </summary>
        <form
          action={stageWorkshopChange}
          className="mt-4 space-y-3 border-t border-slate-100 pt-4"
        >
          <Fields workshop={workshop} kind="CANCEL" context={context} />
          <SubmitButton>Review cancellation</SubmitButton>
        </form>
      </details>
      {workshop.status === 'PUBLISHED' && workshop.scheduledEnd.getTime() <= Date.now() && (
        <details className={optionClass}>
          <summary className={summaryClass}>
            <CheckCircle2 className="size-4 text-green-600" /> Record completion
          </summary>
          <form
            action={stageWorkshopChange}
            className="mt-4 space-y-3 border-t border-slate-100 pt-4"
          >
            <Fields workshop={workshop} kind="COMPLETE" context={context} />
            <SubmitButton>Review completion</SubmitButton>
          </form>
        </details>
      )}
    </section>
  )
}
