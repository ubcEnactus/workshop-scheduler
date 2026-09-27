'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireRole } from '@/lib/auth'
import { replaceCurrentAvailability } from '@/lib/availability'
import { SchedulingError } from '@/lib/scheduling/store'
import { currentAvailabilitySchema } from '@/lib/schemas/availability'

export async function saveAvailabilityForm(
  _state: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const user = await requireRole('PA')
  const parsed = currentAvailabilitySchema.safeParse({
    slots: formData.getAll('slots'),
    expectedRevision: formData.get('expectedRevision') || undefined,
  })
  if (!parsed.success)
    return {
      error:
        'Choose valid weekday availability between 8:30 AM and 3:00 PM. Your entries have been kept.',
    }
  try {
    await replaceCurrentAvailability(user.id, parsed.data.slots, parsed.data.expectedRevision)
  } catch (error) {
    if (error instanceof SchedulingError) return { error: error.message }
    throw error
  }
  revalidatePath('/pa/availability')
  revalidatePath('/pa')
  revalidatePath('/admin', 'layout')
  redirect('/pa/availability?saved=1')
}

export async function saveAvailability(formData: FormData): Promise<void> {
  const user = await requireRole('PA')

  const parsed = currentAvailabilitySchema.safeParse({
    slots: formData.getAll('slots'),
    expectedRevision: formData.get('expectedRevision') || undefined,
  })
  if (!parsed.success) redirect('/pa/availability?error=1')

  try {
    await replaceCurrentAvailability(user.id, parsed.data.slots, parsed.data.expectedRevision)
  } catch (error) {
    if (error instanceof SchedulingError) redirect('/pa/availability?error=1')
    throw error
  }

  revalidatePath('/pa/availability')
  revalidatePath('/pa')
  revalidatePath('/admin', 'layout')
  redirect('/pa/availability?saved=1')
}
