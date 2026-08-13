'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { cycleSchema, cycleIdSchema } from '@/lib/schemas/cycles'

export async function createCycle(formData: FormData) {
  await requireRole('ADMIN')
  const parsed = cycleSchema.parse({
    name: formData.get('name'),
    startDate: formData.get('startDate'),
    endDate: formData.get('endDate'),
  })
  await prisma.cycle.create({ data: { ...parsed, status: 'DRAFT' } })
  revalidatePath('/admin/cycles')
}

export async function openCycle(formData: FormData) {
  await requireRole('ADMIN')
  const { id } = cycleIdSchema.parse({ id: formData.get('id') })

  await prisma.$transaction(async (tx) => {
    const cycle = await tx.cycle.findUnique({ where: { id } })
    if (!cycle) throw new Error('Cycle not found.')
    if (cycle.status !== 'DRAFT') throw new Error('Only DRAFT cycles can be opened.')

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
          cycleId: id,
          classSectionId: cls.id,
          status: 'UNSCHEDULED' as const,
        })),
      })
    }

    await tx.cycle.update({ where: { id }, data: { status: 'OPEN' } })
  })

  revalidatePath('/admin/cycles')
}

export async function closeCycle(formData: FormData) {
  await requireRole('ADMIN')
  const { id } = cycleIdSchema.parse({ id: formData.get('id') })

  const cycle = await prisma.cycle.findUnique({ where: { id } })
  if (!cycle) throw new Error('Cycle not found.')
  if (cycle.status === 'DRAFT' || cycle.status === 'CLOSED') {
    throw new Error('Only OPEN or SCHEDULED cycles can be closed.')
  }

  await prisma.cycle.update({ where: { id }, data: { status: 'CLOSED' } })
  revalidatePath('/admin/cycles')
}

export async function deleteCycle(formData: FormData) {
  await requireRole('ADMIN')
  const { id } = cycleIdSchema.parse({ id: formData.get('id') })

  const cycle = await prisma.cycle.findUnique({ where: { id } })
  if (!cycle) throw new Error('Cycle not found.')
  if (cycle.status !== 'DRAFT') throw new Error('Only DRAFT cycles can be deleted.')

  await prisma.cycle.delete({ where: { id } })
  revalidatePath('/admin/cycles')
}
