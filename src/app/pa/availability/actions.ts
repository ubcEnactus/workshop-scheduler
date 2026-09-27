'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireRole } from '@/lib/auth'
import { replaceAvailability } from '@/lib/availability'
import { SchedulingError, scheduleTransaction } from '@/lib/scheduling/store'
import {
  availabilityChangeSchema,
  paAvailabilityExceptionSchema,
  removePAAvailabilityExceptionSchema,
} from '@/lib/schemas/availability'
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
  try { await replaceAvailability(user.id, parsed.data.slots, parsed.data.effectiveFrom, parsed.data.expectedRevision) }
  catch (error) { if (error instanceof SchedulingError) return { error: error.message }; throw error }
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

  try { await replaceAvailability(user.id, parsed.data.slots, parsed.data.effectiveFrom, parsed.data.expectedRevision) }
  catch (error) { if (error instanceof SchedulingError) redirect('/pa/availability?error=1'); throw error }

  revalidatePath('/pa/availability')
  revalidatePath('/pa')
  revalidatePath('/admin', 'layout')
  redirect(`/pa/availability?saved=1&effectiveFrom=${parsed.data.effectiveFrom}`)
}

export async function saveAvailabilityExceptionForm(
  _state: { error?: string; saved?: boolean },
  formData: FormData
): Promise<{ error?: string; saved?: boolean }> {
  const user = await requireRole('PA')
  const parsed = paAvailabilityExceptionSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  if (parsed.data.date < vancouverDateKey(new Date()))
    return { error: 'Availability exceptions must be today or in the future.' }
  await scheduleTransaction(async (tx) => {
    await tx.pAAvailabilityException.create({
      data: {
        userId: user.id,
        date: new Date(`${parsed.data.date}T00:00:00.000Z`),
        kind: parsed.data.kind,
        startMinute: parsed.data.startMinute,
        endMinute: parsed.data.endMinute,
        notes: parsed.data.notes || null,
      },
    })
  })
  revalidatePath('/pa/availability')
  revalidatePath('/pa')
  revalidatePath('/admin', 'layout')
  return { saved: true }
}

export async function removeAvailabilityExceptionForm(
  _state: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const user = await requireRole('PA')
  const parsed = removePAAvailabilityExceptionSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'This exception changed. Reload and try again.' }
  await scheduleTransaction(async (tx) => {
    const removed = await tx.pAAvailabilityException.deleteMany({
      where: { id: parsed.data.id, userId: user.id },
    })
    if (!removed.count) throw new Error('Availability exception not found.')
  })
  revalidatePath('/pa/availability')
  revalidatePath('/pa')
  revalidatePath('/admin', 'layout')
  return {}
}
