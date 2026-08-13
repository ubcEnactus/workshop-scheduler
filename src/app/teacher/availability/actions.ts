'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireRole } from '@/lib/auth'
import { replaceAvailability } from '@/lib/availability'
import { availabilitySchema } from '@/lib/schemas/availability'

export async function saveAvailability(formData: FormData): Promise<void> {
  const user = await requireRole('TEACHER')

  const parsed = availabilitySchema.safeParse({ slots: formData.getAll('slots') })
  if (!parsed.success) redirect('/teacher/availability?error=1')

  await replaceAvailability(user.id, parsed.data.slots)

  revalidatePath('/teacher/availability')
  revalidatePath('/teacher')
  redirect('/teacher/availability?saved=1')
}
