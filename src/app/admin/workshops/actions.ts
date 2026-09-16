'use server'

import { Prisma } from '@prisma/client'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { workshopSchema, workshopVersionSchema } from '@/lib/schemas/workshops'
import type { WorkshopFormState } from '@/lib/schemas/form-state'
import { readSchedulingContext, schedulingHref } from '@/lib/scheduling/navigation'
import {
  scheduleTransaction,
  validateSlot,
  SchedulingError as WorkshopError,
} from '@/lib/scheduling/store'

function readInput(form: FormData) {
  return workshopSchema.safeParse(
    Object.fromEntries(
      ['classSectionId', 'date', 'startTime', 'endTime', 'minPAs', 'maxPAs'].map((key) => [
        key,
        form.get(key),
      ])
    )
  )
}

async function createDraft(formData: FormData) {
  const parsed = readInput(formData)
  if (!parsed.success)
    return {
      error: parsed.error.issues[0].message,
      fields: Object.fromEntries(
        parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])
      ),
    }
  let workshop
  try {
    workshop = await scheduleTransaction(async (tx) => {
      const data = await validateSlot(tx, parsed.data)
      return tx.workshop.create({ data })
    })
  } catch (error) {
    if (
      error instanceof WorkshopError ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
    ) {
      const message =
        error instanceof WorkshopError
          ? error.message
          : 'The schedule changed. Reload and try again.'
      return { error: message }
    }
    throw error
  }
  revalidatePath('/admin/workshops')
  return { id: workshop.id }
}

async function updateDraft(formData: FormData) {
  const identity = workshopVersionSchema.safeParse({
    id: formData.get('id'),
    version: formData.get('version'),
  })
  if (!identity.success) return { error: 'Invalid workshop version. Reload and try again.' }
  const target = `/admin/workshops/${identity.data.id}`
  const parsed = readInput(formData)
  if (!parsed.success)
    return {
      error: parsed.error.issues[0].message,
      fields: Object.fromEntries(
        parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])
      ),
    }
  try {
    await scheduleTransaction(async (tx) => {
      const existing = await tx.workshop.findUnique({
        where: { id: identity.data.id },
        include: { _count: { select: { assignments: true } } },
      })
      if (!existing) throw new WorkshopError('Unknown workshop.')
      if (existing.status !== 'DRAFT' || existing._count.assignments > 0)
        throw new WorkshopError('Only unstaffed draft workshops can be edited here.')
      if (existing.version !== identity.data.version)
        throw new WorkshopError('This workshop changed. Reload before editing it again.')
      const data = await validateSlot(tx, parsed.data, existing.id)
      const result = await tx.workshop.updateMany({
        where: { id: existing.id, version: identity.data.version, status: 'DRAFT' },
        data: { ...data, locked: true, version: { increment: 1 } },
      })
      if (result.count !== 1)
        throw new WorkshopError('This workshop changed. Reload before editing it again.')
    })
  } catch (error) {
    if (error instanceof WorkshopError) return { error: error.message }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
      return { error: 'The schedule changed. Reload and try again.' }
    throw error
  }
  revalidatePath('/admin/workshops')
  revalidatePath(target)
  return { id: identity.data.id }
}

export async function createWorkshop(formData: FormData) {
  await requireRole('ADMIN')
  const result = await createDraft(formData)
  const context = readSchedulingContext(formData)
  if (result.error)
    redirect(
      schedulingHref('/admin/workshops', context, { create: '1' }) +
        '&error=' +
        encodeURIComponent(result.error)
    )
  redirect(schedulingHref('/admin/workshops/' + result.id, context, { saved: '1' }))
}
export async function updateWorkshop(formData: FormData) {
  await requireRole('ADMIN')
  const result = await updateDraft(formData)
  const identity = workshopVersionSchema.safeParse(Object.fromEntries(formData))
  const target = identity.success ? '/admin/workshops/' + identity.data.id : '/admin/workshops'
  if (result.error) redirect(target + '?error=' + encodeURIComponent(result.error))
  redirect(schedulingHref(target, readSchedulingContext(formData), { saved: '1' }))
}
export async function createWorkshopForm(
  _state: WorkshopFormState,
  formData: FormData
): Promise<WorkshopFormState> {
  await requireRole('ADMIN')
  const result = await createDraft(formData)
  if (result.error) return result
  redirect(
    schedulingHref('/admin/workshops/' + result.id, readSchedulingContext(formData), { saved: '1' })
  )
}
export async function updateWorkshopForm(
  _state: WorkshopFormState,
  formData: FormData
): Promise<WorkshopFormState> {
  await requireRole('ADMIN')
  const result = await updateDraft(formData)
  if (result.error) return result
  redirect(
    schedulingHref('/admin/workshops/' + result.id, readSchedulingContext(formData), { saved: '1' })
  )
}
