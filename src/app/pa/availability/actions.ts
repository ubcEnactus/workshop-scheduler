'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireRole } from '@/lib/auth'
import { replaceAvailability } from '@/lib/availability'
import { availabilitySchema } from '@/lib/schemas/availability'

export async function saveAvailabilityForm(
  _state: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const user = await requireRole('PA')
  const parsed = availabilitySchema.safeParse({ slots: formData.getAll('slots') })
  if (!parsed.success)
    return {
      error:
        'Choose valid weekday availability between 8:30 AM and 3:00 PM. Your entries have been kept.',
    }
  await replaceAvailability(user.id, parsed.data.slots)
  revalidatePath('/pa/availability')
  revalidatePath('/pa')
  revalidatePath('/admin/workshops', 'layout')
  redirect('/pa/availability?saved=1')
}

export async function saveAvailability(formData: FormData): Promise<void> {
  const user = await requireRole('PA')

  const parsed = availabilitySchema.safeParse({ slots: formData.getAll('slots') })
  if (!parsed.success) redirect('/pa/availability?error=1')

  await replaceAvailability(user.id, parsed.data.slots)

  revalidatePath('/pa/availability')
  revalidatePath('/pa')
  revalidatePath('/admin/workshops', 'layout')
  redirect('/pa/availability?saved=1')
}
