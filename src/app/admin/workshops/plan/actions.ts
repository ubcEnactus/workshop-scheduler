'use server'
import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { batchSchema } from '@/lib/schemas/planning'
import { scheduleTransaction, SchedulingError, validateSlot } from '@/lib/scheduling/store'
import { vancouverMonthBounds } from '@/lib/time'
import type { WorkshopFormState } from '@/lib/schemas/form-state'
import { readSchedulingContext, schedulingHref } from '@/lib/scheduling/navigation'

async function runBatch(user: { id: string }, formData: FormData) {
  const fields = [
    'classSectionId',
    'date',
    'startTime',
    'durationMinutes',
    'minPAs',
    'maxPAs',
  ] as const
  const columns = Object.fromEntries(fields.map((key) => [key, formData.getAll(key)]))
  const rows = columns.classSectionId.map((_, i) =>
    Object.fromEntries(fields.map((key) => [key, columns[key][i]]))
  )
  const parsed = batchSchema.safeParse({
    requestKey: formData.get('requestKey'),
    month: formData.get('month'),
    slots: rows,
  })
  if (!parsed.success || fields.some((key) => columns[key].length !== rows.length))
    return {
      error: parsed.success ? 'Incomplete workshop rows.' : parsed.error.issues[0].message,
      fields: parsed.success
        ? {}
        : Object.fromEntries(
            parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message])
          ),
    }
  const { requestKey, month, slots } = parsed.data
  const payloadHash = createHash('sha256').update(JSON.stringify({ month, slots })).digest('hex')
  let batchId: string
  try {
    batchId = await scheduleTransaction(async (tx) => {
      const prior = await tx.workshopBatch.findUnique({ where: { requestKey } })
      if (prior) {
        if (prior.actorId !== user.id || prior.payloadHash !== payloadHash)
          throw new SchedulingError(
            'This request key was already used for different workshop choices. Preview again.'
          )
        return prior.id
      }
      const { start, end } = vancouverMonthBounds(month)
      for (const classSectionId of new Set(slots.map((s) => s.classSectionId))) {
        const cls = await tx.classSection.findUnique({ where: { id: classSectionId } })
        if (!cls) throw new SchedulingError('A selected class no longer exists.')
        const count = await tx.workshop.count({
          where: {
            classSectionId,
            status: { not: 'CANCELLED' },
            scheduledStart: { gte: start, lt: end },
          },
        })
        if (
          slots.filter((s) => s.classSectionId === classSectionId).length >
          Math.max(0, cls.monthlyCadence - count)
        )
          throw new SchedulingError(
            'The monthly plan changed. Preview the missing workshops again. Use Create workshop for an extra occurrence.'
          )
      }
      const batch = await tx.workshopBatch.create({
        data: { requestKey, month, payloadHash, actorId: user.id },
      })
      for (const slot of slots) {
        const data = await validateSlot(tx, slot)
        await tx.workshop.create({ data: { ...data, batchId: batch.id } })
      }
      return batch.id
    })
  } catch (error) {
    if (error instanceof SchedulingError) return { error: error.message }
    throw error
  }
  revalidatePath('/admin/workshops')
  return { month, batchId }
}

export async function createWorkshopBatch(formData: FormData) {
  const user = await requireRole('ADMIN')
  const result = await runBatch(user, formData)
  const context = readSchedulingContext(formData)
  if (result.error)
    redirect(
      schedulingHref('/admin/workshops/plan', context) +
        '&error=' +
        encodeURIComponent(result.error)
    )
  redirect(schedulingHref('/admin/workshops', context, { batch: result.batchId }))
}
export async function createWorkshopBatchForm(
  _state: WorkshopFormState,
  formData: FormData
): Promise<WorkshopFormState> {
  const user = await requireRole('ADMIN')
  const result = await runBatch(user, formData)
  if (result.error) return result
  redirect(
    schedulingHref('/admin/workshops', readSchedulingContext(formData), { batch: result.batchId })
  )
}
