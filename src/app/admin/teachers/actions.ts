'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { teacherSchema, teacherIdSchema } from '@/lib/schemas/teachers'

const DUPLICATE_EMAIL = 'That email is already in use by another account.'

function isDuplicateEmail(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

export async function createTeacher(formData: FormData) {
  await requireRole('ADMIN')
  const parsed = teacherSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    schoolId: formData.get('schoolId'),
  })
  if (!parsed.success) {
    redirect(`/admin/teachers?error=${encodeURIComponent(parsed.error.issues[0].message)}`)
  }

  try {
    await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        role: 'TEACHER',
        schoolId: parsed.data.schoolId,
      },
    })
  } catch (err) {
    if (isDuplicateEmail(err))
      redirect(`/admin/teachers?error=${encodeURIComponent(DUPLICATE_EMAIL)}`)
    throw err
  }
  revalidatePath('/admin/teachers')
}

export async function updateTeacher(formData: FormData) {
  await requireRole('ADMIN')
  const id = teacherIdSchema.safeParse({ id: formData.get('id') })
  if (!id.success) {
    redirect('/admin/teachers?error=Unknown+teacher.')
  }

  const parsed = teacherSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    schoolId: formData.get('schoolId'),
  })
  if (!parsed.success) {
    redirect(
      `/admin/teachers/${id.data.id}/edit?error=${encodeURIComponent(parsed.error.issues[0].message)}`
    )
  }

  try {
    await prisma.user.update({
      where: { id: id.data.id, role: 'TEACHER', deletedAt: null },
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        schoolId: parsed.data.schoolId,
      },
    })
  } catch (err) {
    if (isDuplicateEmail(err)) {
      redirect(`/admin/teachers/${id.data.id}/edit?error=${encodeURIComponent(DUPLICATE_EMAIL)}`)
    }
    throw err
  }
  redirect('/admin/teachers')
}

export async function softDeleteTeacher(formData: FormData) {
  await requireRole('ADMIN')
  const id = teacherIdSchema.safeParse({ id: formData.get('id') })
  if (!id.success) {
    redirect('/admin/teachers?error=Unknown+teacher.')
  }
  await prisma.user.update({
    where: { id: id.data.id, role: 'TEACHER', deletedAt: null },
    data: { deletedAt: new Date() },
  })
  revalidatePath('/admin/teachers')
}
