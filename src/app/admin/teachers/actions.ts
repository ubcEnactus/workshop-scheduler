'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { scheduleTransaction } from '@/lib/scheduling/store'
import { teacherSchema, teacherIdSchema } from '@/lib/schemas/teachers'

const DUPLICATE_EMAIL = 'That email is already in use by another account.'

function isDuplicateEmail(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

async function isActiveSchool(schoolId: string): Promise<boolean> {
  const school = await prisma.school.findFirst({
    where: { id: schoolId, deletedAt: null },
    select: { id: true },
  })
  return school !== null
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
    await scheduleTransaction(async (tx) => {
      if (!(await tx.school.findFirst({ where: { id: parsed.data.schoolId, deletedAt: null } })))
        redirect('/admin/teachers?error=Select+an+active+school.')
      await tx.user.create({
        data: {
          name: parsed.data.name,
          email: parsed.data.email,
          role: 'TEACHER',
          schoolId: parsed.data.schoolId,
        },
      })
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
  if (!(await isActiveSchool(parsed.data.schoolId))) {
    redirect(`/admin/teachers/${id.data.id}/edit?error=Select+an+active+school.`)
  }

  try {
    const error = await scheduleTransaction(async (tx) => {
      const teacher = await tx.user.findFirst({
        where: { id: id.data.id, role: 'TEACHER', deletedAt: null },
        include: { _count: { select: { classesTaught: true } } },
      })
      if (!teacher) return 'Unknown teacher.'
      const school = await tx.school.findFirst({
        where: { id: parsed.data.schoolId, deletedAt: null },
      })
      if (!school) return 'Select an active school.'
      if (teacher.schoolId !== school.id && teacher._count.classesTaught > 0) {
        return 'Reassign or remove this teacher’s classes before changing their school.'
      }
      await tx.user.update({
        where: { id: teacher.id, deletedAt: null },
        data: parsed.data,
      })
      return null
    })
    if (error) redirect(`/admin/teachers/${id.data.id}/edit?error=${encodeURIComponent(error)}`)
  } catch (err) {
    if (isDuplicateEmail(err)) {
      redirect(`/admin/teachers/${id.data.id}/edit?error=${encodeURIComponent(DUPLICATE_EMAIL)}`)
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
      redirect(`/admin/teachers/${id.data.id}/edit?error=Records+changed.+Reload+and+try+again.`)
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
  await scheduleTransaction(async (tx) => {
    const assignedClass = await tx.classSection.findFirst({
      where: { teacherId: id.data.id },
      select: { id: true },
    })
    if (assignedClass) {
      redirect('/admin/teachers?error=Reassign+this+teacher%27s+classes+before+removing+them.')
    }
    await tx.user.update({
      where: { id: id.data.id, role: 'TEACHER', deletedAt: null },
      data: { deletedAt: new Date() },
    })
  })
  revalidatePath('/admin/teachers')
}
