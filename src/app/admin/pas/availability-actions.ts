'use server'

import { requireRole } from '@/lib/auth'
import { replaceCurrentAvailability, checkAvailabilityRevision } from '@/lib/availability'
import { scheduleTransaction, SchedulingError } from '@/lib/scheduling/store'
import {
  adminAvailabilityTargetSchema,
  currentAvailabilitySchema,
  paAvailabilityExceptionSchema,
  removePAAvailabilityExceptionSchema,
} from '@/lib/schemas/availability'
import { vancouverDateKey } from '@/lib/time'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

type State = { error?: string; saved?: boolean }
function failure(error: unknown): State {
  if (error instanceof SchedulingError) return { error: error.message }
  throw error
}
function refresh() {
  revalidatePath('/admin', 'layout')
  revalidatePath('/pa', 'layout')
}
export async function savePAAvailability(
  paId: string,
  expectedRevision: string,
  _state: State,
  form: FormData
): Promise<State> {
  await requireRole('ADMIN')
  const target = adminAvailabilityTargetSchema.safeParse({ paId, expectedRevision })
  const parsed = currentAvailabilitySchema.safeParse({
    slots: form.getAll('slots'),
  })
  if (!target.success || !parsed.success) return { error: 'Check the selected times.' }
  try {
    await replaceCurrentAvailability(
      target.data.paId,
      parsed.data.slots,
      target.data.expectedRevision
    )
  } catch (error) {
    return failure(error)
  }
  refresh()
  redirect(`/admin/pas/${target.data.paId}/availability?saved=1`)
}
export async function savePAException(
  paId: string,
  expectedRevision: string,
  _state: State,
  form: FormData
): Promise<State> {
  await requireRole('ADMIN')
  const target = adminAvailabilityTargetSchema.safeParse({ paId, expectedRevision })
  const parsed = paAvailabilityExceptionSchema.safeParse(Object.fromEntries(form))
  if (!target.success || !parsed.success) return { error: 'Check the date and time range.' }
  if (parsed.data.date < vancouverDateKey(new Date()))
    return { error: 'Choose today or a future date.' }
  try {
    await scheduleTransaction(async (tx) => {
      await checkAvailabilityRevision(tx, target.data.paId, target.data.expectedRevision)
      await tx.pAAvailabilityException.create({
        data: {
          ...parsed.data,
          userId: target.data.paId,
          date: new Date(parsed.data.date),
          notes: parsed.data.notes || null,
        },
      })
    })
  } catch (error) {
    return failure(error)
  }
  refresh()
  return { saved: true }
}
export async function removePAException(
  paId: string,
  expectedRevision: string,
  _state: State,
  form: FormData
): Promise<State> {
  await requireRole('ADMIN')
  const target = adminAvailabilityTargetSchema.safeParse({ paId, expectedRevision })
  const parsed = removePAAvailabilityExceptionSchema.safeParse(Object.fromEntries(form))
  if (!target.success || !parsed.success)
    return { error: 'This time changed. Reload and try again.' }
  try {
    await scheduleTransaction(async (tx) => {
      await checkAvailabilityRevision(tx, target.data.paId, target.data.expectedRevision)
      const removed = await tx.pAAvailabilityException.deleteMany({
        where: { id: parsed.data.id, userId: target.data.paId },
      })
      if (!removed.count) throw new SchedulingError('This time changed. Reload and try again.')
    })
  } catch (error) {
    return failure(error)
  }
  refresh()
  return {}
}
