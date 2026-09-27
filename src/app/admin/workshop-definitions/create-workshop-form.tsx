'use client'

import type { ReactNode } from 'react'
import { SaveAndOpenForm } from '@/components/save-and-open-form'
import { createWorkshopDefinition } from '../class-workshops/actions'

export function CreateWorkshopForm({ children }: { children: ReactNode }) {
  async function submit(form: FormData) {
    const result = await createWorkshopDefinition(form)
    if (!result.ok) return result
    return {
      ok: true as const,
      destination: '/admin/workshop-definitions/' + encodeURIComponent(result.id) + '?created=1',
    }
  }

  return (
    <div className="max-w-3xl">
      <SaveAndOpenForm
        action={submit}
        submitLabel="Create a workshop"
        successMessage="Workshop created."
      >
        {children}
      </SaveAndOpenForm>
    </div>
  )
}
