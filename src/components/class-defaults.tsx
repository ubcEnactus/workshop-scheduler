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
      key: 'monthlyCadence',
      label: 'Workshops per month',
      value: initial?.monthlyCadence ?? 1,
      min: 0,
      max: 31,
    },
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
    <fieldset className="space-y-3 rounded border p-3">
      <legend>Monthly workshop defaults</legend>
      <p className="text-sm">
        Used for new plans. Changing defaults leaves existing workshops unchanged.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field.key}>
            <label htmlFor={field.key} className="block text-sm">
              {field.label}
            </label>
            <input
              id={field.key}
              name={field.key}
              type="number"
              min={field.min}
              max={field.max}
              step="1"
              defaultValue={field.value}
              required
              className="mt-1 w-full rounded border p-2"
            />
          </div>
        ))}
      </div>
    </fieldset>
  )
}
