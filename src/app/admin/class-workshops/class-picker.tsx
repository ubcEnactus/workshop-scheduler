'use client'

import { useState } from 'react'

type PickerClass = {
  id: string
  name: string
  teacherName: string
}

type PickerSchool = {
  id: string
  name: string
  classes: PickerClass[]
}

export function ClassPicker({
  schools,
  initialSelectedIds = [],
}: {
  schools: PickerSchool[]
  initialSelectedIds?: string[]
}) {
  const [selected, setSelected] = useState(() => new Set(initialSelectedIds))
  const allIds = schools.flatMap((school) => school.classes.map((cls) => cls.id))

  function setMany(ids: string[], checked: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      for (const id of ids) {
        if (checked) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  return (
    <fieldset className="space-y-4">
      <legend className="text-sm font-semibold">Teachers to include</legend>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold"
          onClick={() => setMany(allIds, true)}
        >
          Select all active teachers
        </button>
        <button
          type="button"
          className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 underline"
          onClick={() => setSelected(new Set())}
        >
          Clear selection
        </button>
        <span className="text-xs text-slate-500" aria-live="polite">
          {selected.size} selected
        </span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {schools.map((school) => {
          const ids = school.classes.map((cls) => cls.id)
          const allSchoolSelected = ids.length > 0 && ids.every((id) => selected.has(id))
          return (
            <section key={school.id} className="rounded-xl border border-slate-200 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-semibold">{school.name}</h3>
                <button
                  type="button"
                  className="text-xs font-semibold underline"
                  onClick={() => setMany(ids, !allSchoolSelected)}
                >
                  {allSchoolSelected ? 'Clear school' : 'Select school'}
                </button>
              </div>
              {school.classes.length ? (
                <ul className="space-y-2">
                  {school.classes.map((cls) => (
                    <li key={cls.id}>
                      <label className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          name="classSectionIds"
                          value={cls.id}
                          checked={selected.has(cls.id)}
                          onChange={(event) => setMany([cls.id], event.currentTarget.checked)}
                          className="mt-1 size-4"
                        />
                        <span>
                          <span className="block text-sm font-medium">{cls.name}</span>
                          <span className="block text-xs text-slate-500">{cls.teacherName}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No active teachers.</p>
              )}
            </section>
          )
        })}
      </div>
    </fieldset>
  )
}
