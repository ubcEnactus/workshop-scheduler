'use client'
import { useState } from 'react'
export function ClassSelection({
  classes,
  selected,
}: {
  classes: { id: string; label: string }[]
  selected: string[]
}) {
  const [chosen, setChosen] = useState(selected)
  return (
    <fieldset className="space-y-2 rounded border p-4">
      <legend className="px-1 font-medium">Classes to plan</legend>
      <div className="flex gap-4">
        <button
          type="button"
          className="underline"
          onClick={() => setChosen(classes.map((c) => c.id))}
        >
          Select all classes
        </button>
        <button type="button" className="underline" onClick={() => setChosen([])}>
          Clear selection
        </button>
      </div>
      {classes.map((cls) => (
        <label key={cls.id} className="flex items-start gap-2">
          <input
            type="checkbox"
            name="classId"
            value={cls.id}
            checked={chosen.includes(cls.id)}
            onChange={(e) =>
              setChosen(
                e.target.checked ? [...chosen, cls.id] : chosen.filter((id) => id !== cls.id)
              )
            }
            className="mt-1"
          />
          {cls.label}
        </label>
      ))}
    </fieldset>
  )
}
