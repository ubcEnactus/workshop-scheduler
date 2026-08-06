'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { teacherSchema, teacherIdSchema } from '@/lib/schemas/teachers'

export async function createTeacher(formData: FormData) {
  await requireRole('ADMIN')
  const parsed = teacherSchema.parse({
    name: formData.get('name'),
    email: formData.get('email'),
    schoolId: formData.get('schoolId'),
  })
  await prisma.user.create({
    data: {
      name: parsed.name,
      email: parsed.email,
      role: 'TEACHER',
      schoolId: parsed.schoolId,
    },
  })
  revalidatePath('/admin/teachers')
}

export async function updateTeacher(formData: FormData) {
  await requireRole('ADMIN')
  const { id } = teacherIdSchema.parse({ id: formData.get('id') })
  const parsed = teacherSchema.parse({
    name: formData.get('name'),
    email: formData.get('email'),
    schoolId: formData.get('schoolId'),
  })
  await prisma.user.update({
    where: { id, role: 'TEACHER', deletedAt: null },
    data: {
      name: parsed.name,
      email: parsed.email,
      schoolId: parsed.schoolId,
    },
  })
  redirect('/admin/teachers')
}

export async function softDeleteTeacher(formData: FormData) {
  await requireRole('ADMIN')
  const { id } = teacherIdSchema.parse({ id: formData.get('id') })
  await prisma.user.update({
    where: { id, role: 'TEACHER', deletedAt: null },
    data: { deletedAt: new Date() },
  })
  revalidatePath('/admin/teachers')
}
