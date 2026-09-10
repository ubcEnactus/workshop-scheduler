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
    <fieldset className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
      <legend className="px-2 text-sm font-semibold text-slate-900">Classes to plan</legend>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <p className="text-xs font-medium text-slate-500">
          {chosen.length} of {classes.length} selected
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            className="text-xs font-semibold text-[#1e2a4a] hover:underline"
            onClick={() => setChosen(classes.map((c) => c.id))}
          >
            Select all classes
          </button>
          <button
            type="button"
            className="text-xs font-semibold text-slate-500 hover:text-slate-900 hover:underline"
            onClick={() => setChosen([])}
          >
            Clear selection
          </button>
        </div>
      </div>
      {classes.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {classes.map((cls) => {
            const checked = chosen.includes(cls.id)
            return (
              <label
                key={cls.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 text-sm transition-colors ${
                  checked
                    ? 'border-[#1e2a4a]/30 bg-white text-slate-950 shadow-sm'
                    : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white'
                }`}
              >
                <input
                  type="checkbox"
                  name="classId"
                  value={cls.id}
                  checked={checked}
                  onChange={(e) =>
                    setChosen(
                      e.target.checked ? [...chosen, cls.id] : chosen.filter((id) => id !== cls.id)
                    )
                  }
                  className="mt-0.5 size-4 accent-[#1e2a4a]"
                />
                <span className="leading-5">{cls.label}</span>
              </label>
            )
          })}
        </div>
      ) : (
        <p className="py-3 text-sm text-slate-500">No active classes are available.</p>
      )}
    </fieldset>
  )
}
