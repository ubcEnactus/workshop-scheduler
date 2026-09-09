import { SubmitButton } from '@/components/submit-button'
import { DAY_LABELS, formatSlotRange } from '@/lib/time'

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
    <form action={action} className="space-y-4">
      <input type="hidden" name="month" value={month} />
      {initial && (
        <>
          <input type="hidden" name="id" value={initial.id} />
          <input type="hidden" name="version" value={initial.version} />
        </>
      )}
      <div>
        <label htmlFor="workshop-class" className="block text-sm font-medium">
          Class
        </label>
        <select
          id="workshop-class"
          name="classSectionId"
          defaultValue={initial?.classSectionId ?? ''}
          required
          className="mt-1 block w-full rounded border px-3 py-2"
        >
          <option value="">Select a class…</option>
          {classes.map((cls) => (
            <option key={cls.id} value={cls.id}>
              {cls.name} · {cls.school.name} · {cls.teacher.name ?? cls.teacher.email}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="workshop-date" className="block text-sm font-medium">
            Vancouver date
          </label>
          <input
            id="workshop-date"
            type="date"
            name="date"
            defaultValue={initial?.date ?? `${month}-01`}
            required
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="workshop-start" className="block text-sm font-medium">
            Start time
          </label>
          <input
            id="workshop-start"
            type="time"
            name="startTime"
            defaultValue={initial?.startTime}
            required
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="workshop-end" className="block text-sm font-medium">
            End time
          </label>
          <input
            id="workshop-end"
            type="time"
            name="endTime"
            defaultValue={initial?.endTime}
            required
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="workshop-min" className="block text-sm font-medium">
            Minimum PAs
          </label>
          <input
            id="workshop-min"
            type="number"
            name="minPAs"
            min="1"
            step="1"
            defaultValue={initial?.minPAs ?? 1}
            required
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="workshop-max" className="block text-sm font-medium">
            Maximum PAs
          </label>
          <input
            id="workshop-max"
            type="number"
            name="maxPAs"
            min="1"
            step="1"
            defaultValue={initial?.maxPAs ?? 3}
            required
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </div>
      </div>
      <p className="text-sm text-zinc-600">
        Times use America/Vancouver. The entire workshop must fit within one hosting block on the
        selected weekday.
      </p>
      <details className="rounded border p-3">
        <summary className="cursor-pointer text-sm font-medium">Class hosting blocks</summary>
        <ul className="mt-3 space-y-2 text-sm">
          {classes.map((cls) => (
            <li key={cls.id}>
              <strong>
                {cls.name} · {cls.school.name}:
              </strong>{' '}
              {cls.meetings
                .map(
                  (meeting) =>
                    `${DAY_LABELS[meeting.dayOfWeek]} ${formatSlotRange(meeting.startMinute, meeting.endMinute - meeting.startMinute)}`
                )
                .join('; ') || 'No hosting blocks. Add them under Classes first.'}
            </li>
          ))}
        </ul>
      </details>
      {classes.length ? (
        <SubmitButton>{initial ? 'Save draft' : 'Create draft'}</SubmitButton>
      ) : (
        <p>Add an active class and its hosting blocks before creating a workshop.</p>
      )}
    </form>
  )
}
