'use client'

import { useEffect } from 'react'
import {
  planningDraftSchema,
  removeSavedPlanningChoices,
  type SavedPlanningChoice,
} from '@/lib/schemas/planning-draft'

export function ClearSavedPlanningChoices({
  storageKey,
  savedChoices,
}: {
  storageKey: string
  savedChoices: SavedPlanningChoice[]
}) {
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey)
      if (!raw) return
      const parsed = planningDraftSchema.safeParse(JSON.parse(raw) as unknown)
      if (!parsed.success) return
      const { selected } = removeSavedPlanningChoices(parsed.data, savedChoices)
      if (Object.keys(selected).length)
        sessionStorage.setItem(storageKey, JSON.stringify({ ...parsed.data, selected }))
      else sessionStorage.removeItem(storageKey)
    } catch {
      // Storage is optional; the server has already saved and validated the dates.
    }
  }, [storageKey, savedChoices])
  return null
}
