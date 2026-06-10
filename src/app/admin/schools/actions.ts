'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { schoolSchema, schoolIdSchema } from '@/lib/schemas/schools'

export async function createSchool(formData: FormData) {
  await requireRole('ADMIN')
  const parsed = schoolSchema.parse({
    name: formData.get('name'),
    district: formData.get('district'),
  })
  await prisma.school.create({ data: parsed })
  revalidatePath('/admin/schools')
}

export async function updateSchool(formData: FormData) {
  await requireRole('ADMIN')
  const { id } = schoolIdSchema.parse({ id: formData.get('id') })
  const parsed = schoolSchema.parse({
    name: formData.get('name'),
    district: formData.get('district'),
  })
  await prisma.school.update({ where: { id }, data: parsed })
  redirect('/admin/schools')
}

export async function softDeleteSchool(formData: FormData) {
  await requireRole('ADMIN')
  const { id } = schoolIdSchema.parse({ id: formData.get('id') })
  await prisma.school.update({ where: { id }, data: { deletedAt: new Date() } })
  revalidatePath('/admin/schools')
}
