'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { cycleSchema, cycleIdSchema } from '@/lib/schemas/cycles'

function cyclesError(message: string): never {
  redirect(`/admin/cycles?error=${encodeURIComponent(message)}`)
}

export async function createCycle(formData: FormData) {
  await requireRole('ADMIN')
  const parsed = cycleSchema.safeParse({
    name: formData.get('name'),
    startDate: formData.get('startDate'),
    endDate: formData.get('endDate'),
  })
  if (!parsed.success) cyclesError(parsed.error.issues[0].message)

  await prisma.cycle.create({ data: { ...parsed.data, status: 'DRAFT' } })
  revalidatePath('/admin/cycles')
}

export async function openCycle(formData: FormData) {
  await requireRole('ADMIN')
  const id = cycleIdSchema.safeParse({ id: formData.get('id') })
  if (!id.success) cyclesError('Unknown cycle.')

  const cycle = await prisma.cycle.findUnique({ where: { id: id.data.id } })
  if (!cycle) cyclesError('Cycle not found.')
  if (cycle.status !== 'DRAFT') cyclesError('Only draft cycles can be opened.')

  const opened = await prisma.$transaction(async (tx) => {
    const claimed = await tx.cycle.updateMany({
      where: { id: id.data.id, status: 'DRAFT' },
      data: { status: 'OPEN' },
    })
    if (claimed.count === 0) return false

    const classes = await tx.classSection.findMany({
      where: {
        school: { deletedAt: null },
        teacher: { deletedAt: null },
      },
      select: { id: true },
    })

    if (classes.length > 0) {
      await tx.workshop.createMany({
        data: classes.map((cls) => ({
          cycleId: id.data.id,
          classSectionId: cls.id,
          status: 'UNSCHEDULED' as const,
        })),
      })
    }
    return true
  })

  if (!opened) cyclesError('That cycle is no longer a draft.')

  revalidatePath('/admin/cycles')
}

export async function closeCycle(formData: FormData) {
  await requireRole('ADMIN')
  const id = cycleIdSchema.safeParse({ id: formData.get('id') })
  if (!id.success) cyclesError('Unknown cycle.')

  const cycle = await prisma.cycle.findUnique({ where: { id: id.data.id } })
  if (!cycle) cyclesError('Cycle not found.')
  if (cycle.status === 'DRAFT' || cycle.status === 'CLOSED') {
    cyclesError('Only open or scheduled cycles can be closed.')
  }

  await prisma.cycle.update({ where: { id: id.data.id }, data: { status: 'CLOSED' } })
  revalidatePath('/admin/cycles')
}

export async function deleteCycle(formData: FormData) {
  await requireRole('ADMIN')
  const id = cycleIdSchema.safeParse({ id: formData.get('id') })
  if (!id.success) cyclesError('Unknown cycle.')

  const cycle = await prisma.cycle.findUnique({ where: { id: id.data.id } })
  if (!cycle) cyclesError('Cycle not found.')
  if (cycle.status !== 'DRAFT') cyclesError('Only draft cycles can be deleted.')

  await prisma.cycle.delete({ where: { id: id.data.id } })
  revalidatePath('/admin/cycles')
}
