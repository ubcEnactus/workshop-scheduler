import { SubmitButton } from '@/components/submit-button'
import { DAY_LABELS, formatSlotRange } from '@/lib/time'
import { CalendarClock, Clock3, Users } from 'lucide-react'

export type WorkshopClass = {
  id: string
  name: string
  school: { name: string }
  teacher: { name: string | null; email: string }
  meetings: { dayOfWeek: number; startMinute: number; endMinute: number }[]
}

export function WorkshopForm({
  action,
  classes,
  month,
  initial,
}: {
  action: (formData: FormData) => Promise<void>
  classes: WorkshopClass[]
  month: string
  initial?: {
    id: string
    version: number
    classSectionId: string
    date: string
    startTime: string
    endTime: string
    minPAs: number
    maxPAs: number
  }
}) {
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="month" value={month} />
      {initial && (
        <>
          <input type="hidden" name="id" value={initial.id} />
          <input type="hidden" name="version" value={initial.version} />
        </>
      )}
      <div className="field">
        <label htmlFor="workshop-class">Class</label>
        <select
          id="workshop-class"
          name="classSectionId"
          defaultValue={initial?.classSectionId ?? ''}
          required
          className="input"
        >
          <option value="">Select a class…</option>
          {classes.map((cls) => (
            <option key={cls.id} value={cls.id}>
              {cls.name} · {cls.school.name} · {cls.teacher.name ?? cls.teacher.email}
            </option>
          ))}
        </select>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <CalendarClock className="size-4 text-amber-600" />
          Date and time
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="field">
            <label htmlFor="workshop-date">Vancouver date</label>
            <input
              id="workshop-date"
              type="date"
              name="date"
              defaultValue={initial?.date ?? `${month}-01`}
              required
              className="input"
            />
          </div>
          <div className="field">
            <label htmlFor="workshop-start">Start time</label>
            <input
              id="workshop-start"
              type="time"
              name="startTime"
              defaultValue={initial?.startTime}
              required
              className="input"
            />
          </div>
          <div className="field">
            <label htmlFor="workshop-end">End time</label>
            <input
              id="workshop-end"
              type="time"
              name="endTime"
              defaultValue={initial?.endTime}
              required
              className="input"
            />
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Users className="size-4 text-amber-600" />
          Staffing target
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="workshop-min">Minimum PAs</label>
            <input
              id="workshop-min"
              type="number"
              name="minPAs"
              min="1"
              step="1"
              defaultValue={initial?.minPAs ?? 1}
              required
              className="input"
            />
          </div>
          <div className="field">
            <label htmlFor="workshop-max">Maximum PAs</label>
            <input
              id="workshop-max"
              type="number"
              name="maxPAs"
              min="1"
              step="1"
              defaultValue={initial?.maxPAs ?? 3}
              required
              className="input"
            />
          </div>
        </div>
      </div>
      <p className="flex items-start gap-2 text-sm text-slate-500">
        <Clock3 className="mt-0.5 size-4 shrink-0" />
        Times use America/Vancouver. The entire workshop must fit within one hosting block on the
        selected weekday.
      </p>
      <details className="group rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700 group-open:text-slate-950">
          Class hosting blocks
        </summary>
        <ul className="mt-4 divide-y divide-slate-100 text-sm">
          {classes.map((cls) => (
            <li key={cls.id} className="py-2.5 first:pt-0 last:pb-0">
              <strong className="text-slate-900">
                {cls.name} · {cls.school.name}:
              </strong>{' '}
              <span className="text-slate-500">
                {cls.meetings
                  .map(
                    (meeting) =>
                      `${DAY_LABELS[meeting.dayOfWeek]} ${formatSlotRange(meeting.startMinute, meeting.endMinute - meeting.startMinute)}`
                  )
                  .join('; ') || 'No hosting blocks. Add them under Classes first.'}
              </span>
            </li>
          ))}
        </ul>
      </details>
      {classes.length ? (
        <SubmitButton>{initial ? 'Save draft' : 'Create draft'}</SubmitButton>
      ) : (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Add an active class and its hosting blocks before creating a workshop.
        </p>
      )}
    </form>
  )
}
