'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireRole } from '@/lib/auth'
import { replaceAvailability } from '@/lib/availability'
import { SchedulingError } from '@/lib/scheduling/store'
import { availabilityChangeSchema } from '@/lib/schemas/availability'
import { vancouverDateKey } from '@/lib/time'

export async function saveAvailabilityForm(
  _state: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const user = await requireRole('PA')
  const parsed = availabilityChangeSchema.safeParse({
    slots: formData.getAll('slots'),
    effectiveFrom: formData.get('effectiveFrom'),
    expectedRevision: formData.get('expectedRevision') || undefined,
  })
  if (!parsed.success)
    return {
      error:
        'Choose valid weekday availability between 8:30 AM and 3:00 PM. Your entries have been kept.',
    }
  if (parsed.data.effectiveFrom < vancouverDateKey(new Date()))
    return { error: 'Availability changes must take effect today or on a future date.' }
  try {
    await replaceAvailability(
      user.id,
      parsed.data.slots,
      parsed.data.effectiveFrom,
      parsed.data.expectedRevision
    )
  } catch (error) {
    if (error instanceof SchedulingError) return { error: error.message }
    throw error
  }
  revalidatePath('/pa/availability')
  revalidatePath('/pa')
  revalidatePath('/admin', 'layout')
  redirect(`/pa/availability?saved=1&effectiveFrom=${parsed.data.effectiveFrom}`)
}

export async function saveAvailability(formData: FormData): Promise<void> {
  const user = await requireRole('PA')

  const parsed = availabilityChangeSchema.safeParse({
    slots: formData.getAll('slots'),
    effectiveFrom: formData.get('effectiveFrom'),
    expectedRevision: formData.get('expectedRevision') || undefined,
  })
  if (!parsed.success) redirect('/pa/availability?error=1')
  if (parsed.data.effectiveFrom < vancouverDateKey(new Date())) redirect('/pa/availability?error=1')

  try {
    await replaceAvailability(
      user.id,
      parsed.data.slots,
      parsed.data.effectiveFrom,
      parsed.data.expectedRevision
    )
  } catch (error) {
    if (error instanceof SchedulingError) redirect('/pa/availability?error=1')
    throw error
  }

  revalidatePath('/pa/availability')
  revalidatePath('/pa')
  revalidatePath('/admin', 'layout')
  redirect(`/pa/availability?saved=1&effectiveFrom=${parsed.data.effectiveFrom}`)
}
