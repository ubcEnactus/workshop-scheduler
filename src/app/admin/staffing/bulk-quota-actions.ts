'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { scheduleTransaction, SchedulingError } from '@/lib/scheduling/store'
import { readSchedulingContext, schedulingHref } from '@/lib/scheduling/navigation'
import { bulkQuotaSchema, type QuotaState } from '@/lib/schemas/bulk-quotas'
export async function saveQuotas(_state: QuotaState, form: FormData): Promise<QuotaState> {
  await requireRole('ADMIN')
  const ids = form.getAll('paId'),
    values = form.getAll('quota')
  const parsed = bulkQuotaSchema.safeParse({
    month: form.get('month'),
    revision: form.get('revision'),
    rows: ids.map((paId, i) => ({ paId, quota: values[i] })),
  })
  if (!parsed.success || ids.length !== values.length) {
    const fields: Record<string, string> = {}
    if (!parsed.success)
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'rows' && typeof issue.path[1] === 'number')
          fields[String(ids[issue.path[1]])] = issue.message
      }
    return { error: 'Check the highlighted quotas. No changes were saved.', fields }
  }
  try {
    await scheduleTransaction(async (tx) => {
      const settings = await tx.schedulingSettings.findUniqueOrThrow({ where: { id: 1 } })
      if (settings.revision !== parsed.data.revision + 1)
        throw new SchedulingError(
          'The schedule or quotas changed while you were editing. Reload before saving; your entries are still shown below.'
        )
      const pas = await tx.user.findMany({
        where: { role: 'PA', deletedAt: null },
        select: { id: true },
      })
      if (
        pas.length !== parsed.data.rows.length ||
        pas.some((p) => !parsed.data.rows.some((r) => r.paId === p.id))
      )
        throw new SchedulingError('The active PA list changed. Reload before saving.')
      for (const row of parsed.data.rows) {
        if (row.quota === '')
          await tx.monthlyPAQuota.deleteMany({
            where: { paId: row.paId, month: parsed.data.month },
          })
        else
          await tx.monthlyPAQuota.upsert({
            where: { paId_month: { paId: row.paId, month: parsed.data.month } },
            create: { paId: row.paId, month: parsed.data.month, quota: row.quota },
            update: { quota: row.quota },
          })
      }
    })
  } catch (error) {
    if (error instanceof SchedulingError) return { error: error.message }
    throw error
  }
  revalidatePath('/admin/staffing')
  revalidatePath('/admin/workshops', 'layout')
  revalidatePath('/admin')
  redirect(schedulingHref('/admin/staffing', readSchedulingContext(form), { saved: '1' }))
}
