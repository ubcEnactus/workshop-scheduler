'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { schoolSchema, schoolIdSchema } from '@/lib/schemas/schools'

export async function createSchool(formData: FormData) {
  await requireRole('ADMIN')
  const parsed = schoolSchema.safeParse({
    name: formData.get('name'),
    district: formData.get('district'),
  })
  if (!parsed.success) {
    redirect(`/admin/schools?error=${encodeURIComponent(parsed.error.issues[0].message)}`)
  }
  await prisma.school.create({ data: parsed.data })
  revalidatePath('/admin/schools')
}

export async function updateSchool(formData: FormData) {
  await requireRole('ADMIN')
  const id = schoolIdSchema.safeParse({ id: formData.get('id') })
  if (!id.success) {
    redirect('/admin/schools?error=Unknown+school.')
  }

  const parsed = schoolSchema.safeParse({
    name: formData.get('name'),
    district: formData.get('district'),
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
  const dependentRecord = await prisma.school.findFirst({
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
  await prisma.school.update({
    where: { id: id.data.id, deletedAt: null },
    data: { deletedAt: new Date() },
  })
  revalidatePath('/admin/schools')
}
