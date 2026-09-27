'use client'

import type { ReactNode } from 'react'
import { SaveAndOpenForm } from '@/components/save-and-open-form'
import { enrollClassesInRuns } from './actions'

export function EnrollmentForm({
  children,
  workshopId,
  submitLabel,
}: {
  children: ReactNode
  workshopId?: string
  submitLabel: string
}) {
  async function submit(form: FormData) {
    const result = await enrollClassesInRuns(form)
    if (!result.ok) return result
    const target = workshopId
      ? '/admin/workshop-definitions/' + encodeURIComponent(workshopId)
      : '/admin/workshop-definitions/enroll'
    return { ok: true as const, destination: target + '?saved=' + result.created }
  }

  return (
    <SaveAndOpenForm action={submit} submitLabel={submitLabel} successMessage="Teachers saved.">
      {children}
    </SaveAndOpenForm>
  )
}
