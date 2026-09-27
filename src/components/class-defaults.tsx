export function ClassDefaults({
  initial,
}: {
  initial?: {
    monthlyCadence: number
    defaultDurationMinutes: number
    defaultMinPAs: number
    defaultMaxPAs: number
  }
}) {
  const fields = [
    {
      key: 'defaultDurationMinutes',
      label: 'Default duration (minutes)',
      value: initial?.defaultDurationMinutes ?? 60,
      min: 1,
      max: 1440,
    },
    {
      key: 'defaultMinPAs',
      label: 'Default minimum PAs',
      value: initial?.defaultMinPAs ?? 1,
      min: 1,
      max: 2147483647,
    },
    {
      key: 'defaultMaxPAs',
      label: 'Default maximum PAs',
      value: initial?.defaultMaxPAs ?? 3,
      min: 1,
      max: 2147483647,
    },
  ]
  return (
    <fieldset className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
      <legend className="px-2 text-sm font-semibold text-slate-900">Session defaults</legend>
      <p className="mb-4 text-sm text-slate-500">
        Used when a run does not provide its own duration or staffing defaults. Changing these
        values leaves existing sessions unchanged.
      </p>
      <div className="form-grid">
        {fields.map((field) => (
          <div key={field.key} className="field">
            <label htmlFor={field.key}>{field.label}</label>
            <input
              id={field.key}
              name={field.key}
              type="number"
              min={field.min}
              max={field.max}
              step="1"
              defaultValue={field.value}
              required
              className="input"
            />
          </div>
        ))}
      </div>
    </fieldset>
  )
}
