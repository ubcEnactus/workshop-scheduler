'use server'

import { Prisma } from '@prisma/client'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { monthSchema, workshopSchema, workshopVersionSchema } from '@/lib/schemas/workshops'
import { vancouverMonthKey } from '@/lib/time'
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

function handleError(error: unknown, target: string): never {
  if (error instanceof WorkshopError)
    redirect(`${target}?error=${encodeURIComponent(error.message)}`)
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
    redirect(`${target}?error=The+schedule+changed.+Reload+and+try+again.`)
  }
  throw error
}

export async function createWorkshop(formData: FormData) {
  await requireRole('ADMIN')
  const parsed = readInput(formData)
  const requestedMonth = monthSchema.safeParse(formData.get('month'))
  const month = requestedMonth.success ? requestedMonth.data : vancouverMonthKey()
  if (!parsed.success)
    redirect(
      `/admin/workshops?month=${month}&error=${encodeURIComponent(parsed.error.issues[0].message)}`
    )
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
      redirect(`/admin/workshops?month=${month}&error=${encodeURIComponent(message)}`)
    }
    throw error
  }
  revalidatePath('/admin/workshops')
  redirect(`/admin/workshops/${workshop.id}?saved=1`)
}

export async function updateWorkshop(formData: FormData) {
  await requireRole('ADMIN')
  const identity = workshopVersionSchema.safeParse({
    id: formData.get('id'),
    version: formData.get('version'),
  })
  if (!identity.success)
    redirect('/admin/workshops?error=Invalid+workshop+version.+Reload+and+try+again.')
  const target = `/admin/workshops/${identity.data.id}`
  const parsed = readInput(formData)
  if (!parsed.success)
    redirect(`${target}?error=${encodeURIComponent(parsed.error.issues[0].message)}`)
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
    handleError(error, target)
  }
  revalidatePath('/admin/workshops')
  revalidatePath(target)
  redirect(`${target}?saved=1`)
}
