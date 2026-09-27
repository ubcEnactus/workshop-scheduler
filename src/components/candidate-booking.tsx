'use client'

import { useState } from 'react'
import { scheduleCandidate } from '@/app/admin/class-workshops/actions'
import { SubmitButton } from './submit-button'

export function CandidateBooking({
  classWorkshopId,
  candidates,
}: {
  classWorkshopId: string
  candidates: { id: string; label: string; startTime: string; endTime: string; updatedAt: string }[]
}) {
  const [chosen, setChosen] = useState(candidates[0]?.id ?? '')
  const slot = candidates.find((s) => s.id === chosen) ?? candidates[0]
  if (!slot) return null
  return (
    <form action={scheduleCandidate} className="mt-4 space-y-3">
      <input type="hidden" name="classWorkshopId" value={classWorkshopId} />
      <input type="hidden" name="expectedUpdatedAt" value={slot.updatedAt} />
      <label className="field">
        Available time
        <select
          name="slotId"
          className="input"
          value={slot.id}
          onChange={(e) => setChosen(e.target.value)}
        >
          {candidates.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <div key={slot.id} className="grid grid-cols-2 gap-3">
        <label className="field">
          Session start
          <input
            className="input"
            type="time"
            name="startTime"
            required
            defaultValue={slot.startTime}
          />
        </label>
        <label className="field">
          Session end
          <input
            className="input"
            type="time"
            name="endTime"
            required
            defaultValue={slot.endTime}
          />
        </label>
      </div>
      <input type="hidden" name="mode" value="IN_PERSON" />
      <label className="field">
        Location
        <input className="input" name="location" maxLength={500} />
      </label>
      <SubmitButton>Create draft session</SubmitButton>
    </form>
  )
}
