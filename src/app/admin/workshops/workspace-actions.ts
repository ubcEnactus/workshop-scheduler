'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { inlineStaffingSchema, bulkPublicationSchema } from '@/lib/schemas/workspace'
import { scheduleTransaction, SchedulingError } from '@/lib/scheduling/store'
import { changeDraftStaffing, publishDrafts } from '@/lib/scheduling/draft-mutations'

function refresh() {
  revalidatePath('/admin/workshops', 'layout')
  revalidatePath('/admin/staffing')
  revalidatePath('/admin')
  revalidatePath('/pa')
  revalidatePath('/teacher')
}
export async function updateDraftStaffing(
  form: FormData
): Promise<{ error?: string; success?: string }> {
  await requireRole('ADMIN')
  const parsed = inlineStaffingSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success)
    return { error: 'Invalid staffing request. Reload the schedule and try again.' }
  try {
    await scheduleTransaction((tx) => changeDraftStaffing(tx, parsed.data, parsed.data.operation))
  } catch (error) {
    if (error instanceof SchedulingError) return { error: error.message }
    throw error
  }
  refresh()
  return {
    success:
      parsed.data.operation === 'assign'
        ? 'PA assigned. Draft protected from automatic matching.'
        : 'PA removed.',
  }
}
export async function publishSelectedDrafts(
  input: unknown
): Promise<{ error?: string; success?: string }> {
  const actor = await requireRole('ADMIN')
  const parsed = bulkPublicationSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  try {
    await scheduleTransaction((tx) =>
      publishDrafts(tx, actor, parsed.data.entries, parsed.data.inputHash)
    )
  } catch (error) {
    if (error instanceof SchedulingError) return { error: error.message }
    throw error
  }
  refresh()
  return {
    success: `${parsed.data.entries.length} workshop${parsed.data.entries.length === 1 ? '' : 's'} published.`,
  }
}
