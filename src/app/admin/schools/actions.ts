'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { scheduleTransaction } from '@/lib/scheduling/store'
import { schoolSchema, schoolIdSchema } from '@/lib/schemas/schools'
import { isReturningToClassSetup } from '@/lib/schemas/class-setup'
import { readSchedulingContext, schedulingHref } from '@/lib/scheduling/navigation'

function appendError(path: string, message: string) {
  return `${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(message)}`
}

export async function createSchool(formData: FormData) {
  await requireRole('ADMIN')
  const returnToClasses = isReturningToClassSetup(formData.get('returnToClasses'))
  const context = readSchedulingContext(formData)
  const target = returnToClasses
    ? schedulingHref('/admin/schools', context, { returnToClasses: '1' })
    : '/admin/schools'
  const parsed = schoolSchema.safeParse({
    name: formData.get('name'),
  })
  if (!parsed.success) {
    redirect(appendError(target, parsed.error.issues[0].message))
  }
  await prisma.school.create({ data: parsed.data })
  revalidatePath('/admin/schools')
  if (returnToClasses) {
    redirect(
      schedulingHref('/admin/teachers', context, {
        returnToClasses: '1',
        saved: 'school',
      })
    )
  }
}

export async function updateSchool(formData: FormData) {
  await requireRole('ADMIN')
  const id = schoolIdSchema.safeParse({ id: formData.get('id') })
  if (!id.success) {
    redirect('/admin/schools?error=Unknown+school.')
  }

  const parsed = schoolSchema.safeParse({
    name: formData.get('name'),
  })
  if (!parsed.success) {
    redirect(
      `/admin/schools/${id.data.id}/edit?error=${encodeURIComponent(parsed.error.issues[0].message)}`
    )
  }

  await prisma.school.update({ where: { id: id.data.id, deletedAt: null }, data: parsed.data })
  redirect('/admin/schools')
}

export async function softDeleteSchool(formData: FormData) {
  await requireRole('ADMIN')
  const id = schoolIdSchema.safeParse({ id: formData.get('id') })
  if (!id.success) {
    redirect('/admin/schools?error=Unknown+school.')
  }
  await scheduleTransaction(async (tx) => {
    const dependentRecord = await tx.school.findFirst({
      where: {
        id: id.data.id,
        deletedAt: null,
        OR: [{ teachers: { some: { deletedAt: null } } }, { classSections: { some: {} } }],
      },
      select: { id: true },
    })
    if (dependentRecord) {
      redirect('/admin/schools?error=Move+or+remove+this+school%27s+teachers+and+classes+first.')
    }
    await tx.school.update({
      where: { id: id.data.id, deletedAt: null },
      data: { deletedAt: new Date() },
    })
  })
  revalidatePath('/admin/schools')
}
