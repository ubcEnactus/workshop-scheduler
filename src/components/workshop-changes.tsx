import type { ScheduleSnapshot, ScheduledWorkshop } from '@/lib/scheduling/eligibility'
import { stageWorkshopChange } from '@/app/admin/workshops/changes/actions'
import { vancouverDateKey, vancouverMinuteOfDay } from '@/lib/time'
import type { SchedulingContext } from '@/lib/scheduling/navigation'
import { SubmitButton } from './submit-button'
import { Ban, CalendarClock, CheckCircle2, RefreshCw } from 'lucide-react'
import { scheduleHash } from '@/lib/scheduling/matching-preview'
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
          Review and save changes with a short reason.
          {workshop.status === 'PUBLISHED'
            ? ' Contact participants separately when their plans change; no email is sent.'
            : ''}
        </p>
      </div>
      <details className={optionClass} id="edit-session">
        <summary className={summaryClass}>
          <CalendarClock className="size-4 text-blue-600" /> Edit date, PAs and details together
        </summary>
        <form
          action={stageWorkshopChange}
          className="mt-4 space-y-5 border-t border-slate-100 pt-4"
        >
          <input type="hidden" name="inputHash" value={scheduleHash(snapshot)} />
          <p className="text-sm text-slate-600">
            Review the final date and PA team together. A removed PA can leave a published session
            needing replacement staff. PA availability and workload warnings are shown before
            applying. Date exceptions still need confirmation.
          </p>
          <div className="form-grid">
            <label className="field">
              Session date
              <input
                className="input"
                type="date"
                name="date"
                required
                defaultValue={vancouverDateKey(workshop.scheduledStart)}
              />
            </label>
            <label className="field">
              Start time
              <input
                className="input"
                type="time"
                step={900}
                name="startTime"
                required
                defaultValue={clock(workshop.scheduledStart)}
              />
            </label>
            <label className="field">
              End time
              <input
                className="input"
                type="time"
                step={900}
                name="endTime"
                required
                defaultValue={clock(workshop.scheduledEnd)}
              />
            </label>
            <label className="field">
              Minimum PAs
              <input
                className="input"
                type="number"
                min={1}
                name="minPAs"
                required
                defaultValue={workshop.minPAs}
              />
            </label>
            <label className="field">
              Maximum PAs
              <input
                className="input"
                type="number"
                min={1}
                name="maxPAs"
                required
                defaultValue={workshop.maxPAs}
              />
            </label>
          </div>
          <fieldset className="space-y-3">
            <legend className="font-semibold text-slate-900">PA team after this change</legend>
            <p className="text-sm text-slate-500">
              Select everyone who should remain assigned. Availability is checked against the new
              date during review. Missing or partial PA availability and additional daily or weekly
              assignments are warnings, not blocks.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {snapshot.pas.map((pa) => (
                <label
                  key={pa.id}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    name="paIds"
                    value={pa.id}
                    defaultChecked={workshop.assignments.some(
                      (assignment) => assignment.paId === pa.id
                    )}
                  />
                  {pa.name ?? pa.email}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="form-grid">
            <input type="hidden" name="mode" value="IN_PERSON" />
            <label className="field">
              Room, address or meeting link
              <input
                name="location"
                className="input"
                maxLength={500}
                defaultValue={workshop.location ?? ''}
              />
            </label>
          </div>
          <label className="field">
            Participant instructions
            <textarea
              name="participantInstructions"
              aria-label="Participant instructions"
              aria-describedby="edit-participant-help"
              className="input min-h-20"
              maxLength={5000}
              defaultValue={workshop.participantInstructions ?? ''}
            />
            <span id="edit-participant-help" className="text-xs font-normal text-slate-500">
              Visible to assigned PAs and the school’s teachers after publication.
            </span>
          </label>
          <label className="field">
            Internal admin notes
            <textarea
              name="notes"
              aria-label="Internal admin notes"
              aria-describedby="edit-notes-help"
              className="input min-h-20"
              maxLength={5000}
              defaultValue={workshop.notes ?? ''}
            />
            <span id="edit-notes-help" className="text-xs font-normal text-slate-500">
              Only admins can see these notes.
            </span>
          </label>
          <Fields workshop={workshop} kind="EDIT" context={context} />
          <SubmitButton>Review full change</SubmitButton>
        </form>
      </details>
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
                step={900}
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
                step={900}
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
            <p className="text-sm text-slate-600">
              Completion records that delivery occurred. It does not send a message.
            </p>
            <Fields workshop={workshop} kind="COMPLETE" context={context} />
            <SubmitButton>Review completion</SubmitButton>
          </form>
        </details>
      )}
    </section>
  )
}
