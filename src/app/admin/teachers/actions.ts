'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { scheduleTransaction } from '@/lib/scheduling/store'
import { teacherSchema, teacherIdSchema } from '@/lib/schemas/teachers'
import { readSchedulingContext, schedulingHref } from '@/lib/scheduling/navigation'
import { isReturningToClassSetup } from '@/lib/schemas/class-setup'

const DUPLICATE_EMAIL = 'That email is already in use by another account.'

function isDuplicateEmail(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

function appendError(path: string, message: string) {
  return `${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(message)}`
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
  const returnToClasses = isReturningToClassSetup(formData.get('returnToClasses'))
  const context = readSchedulingContext(formData)
  const target = returnToClasses
    ? schedulingHref('/admin/teachers', context, { returnToClasses: '1' })
    : '/admin/teachers'
  const parsed = teacherSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    schoolId: formData.get('schoolId'),
  })
  if (!parsed.success) {
    redirect(appendError(target, parsed.error.issues[0].message))
  }
  let teacherId = ''
  let profileId = ''
  try {
    await scheduleTransaction(async (tx) => {
      if (!(await tx.school.findFirst({ where: { id: parsed.data.schoolId, deletedAt: null } })))
        redirect(appendError(target, 'Select an active school.'))
      const teacher = await tx.user.create({
        data: {
          name: parsed.data.name,
          email: parsed.data.email,
          role: 'TEACHER',
          schoolId: parsed.data.schoolId,
          classesTaught: { create: { name: parsed.data.name, schoolId: parsed.data.schoolId } },
        },
        include: { classesTaught: { select: { id: true } } },
      })
      teacherId = teacher.id
      profileId = teacher.classesTaught[0].id
    })
  } catch (err) {
    if (isDuplicateEmail(err)) redirect(appendError(target, DUPLICATE_EMAIL))
    throw err
  }
  revalidatePath('/admin/teachers')
  revalidatePath('/admin/classes')
  redirect(
    schedulingHref(
      '/admin/teachers/' + teacherId,
      { ...context, schoolId: parsed.data.schoolId, classSectionId: profileId },
      { saved: 'created' }
    ) + '#availability'
  )
}

export async function updateTeacher(formData: FormData) {
  await requireRole('ADMIN')
  const id = teacherIdSchema.safeParse({ id: formData.get('id') })
  if (!id.success) {
    redirect('/admin/teachers?error=Unknown+teacher.')
  }
  const target =
    formData.get('directory') === 'combined'
      ? schedulingHref('/admin/teachers/' + id.data.id + '/edit', readSchedulingContext(formData))
      : '/admin/teachers/' + id.data.id + '/edit'
  const errorTarget = target + (target.includes('?') ? '&' : '?') + 'error='

  const parsed = teacherSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    schoolId: formData.get('schoolId'),
  })
  if (!parsed.success) {
    redirect(errorTarget + encodeURIComponent(parsed.error.issues[0].message))
  }
  if (!(await isActiveSchool(parsed.data.schoolId))) {
    redirect(errorTarget + 'Select+an+active+school.')
  }

  try {
    const error = await scheduleTransaction(async (tx) => {
      const teacher = await tx.user.findFirst({
        where: { id: id.data.id, role: 'TEACHER', deletedAt: null },
        include: {
          classesTaught: {
            include: {
              _count: {
                select: {
                  classWorkshops: true,
                  meetings: true,
                  availabilitySlots: true,
                  availabilityExceptions: true,
                },
              },
            },
          },
        },
      })
      if (!teacher) return 'Unknown teacher.'
      const school = await tx.school.findFirst({
        where: { id: parsed.data.schoolId, deletedAt: null },
      })
      if (!school) return 'Select an active school.'
      if (
        teacher.schoolId !== school.id &&
        teacher.classesTaught.some((profile) =>
          Object.values(profile._count).some((count) => count > 0)
        )
      ) {
        return 'This teacher has a saved schedule. Keep its school to preserve availability and workshop history.'
      }
      await tx.user.update({
        where: { id: teacher.id, deletedAt: null },
        data: parsed.data,
      })
      await tx.classSection.updateMany({
        where: { teacherId: teacher.id },
        data: { name: parsed.data.name, schoolId: school.id },
      })
      return null
    })
    if (error) redirect(errorTarget + encodeURIComponent(error))
  } catch (err) {
    if (isDuplicateEmail(err)) {
      redirect(errorTarget + encodeURIComponent(DUPLICATE_EMAIL))
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
      redirect(errorTarget + 'Records+changed.+Reload+and+try+again.')
    }
    throw err
  }
  revalidatePath('/admin', 'layout')
  revalidatePath('/admin/teachers')
  redirect(
    schedulingHref('/admin/teachers/' + id.data.id, readSchedulingContext(formData), {
      saved: 'teacher',
    })
  )
}

export async function softDeleteTeacher(formData: FormData) {
  await requireRole('ADMIN')
  const target =
    formData.get('directory') === 'combined'
      ? schedulingHref('/admin/classes', readSchedulingContext(formData))
      : '/admin/teachers'
  const errorTarget = target + (target.includes('?') ? '&' : '?') + 'error='
  const id = teacherIdSchema.safeParse({ id: formData.get('id') })
  if (!id.success) {
    redirect(errorTarget + 'Unknown+teacher.')
  }
  await scheduleTransaction(async (tx) => {
    const assignedClass = await tx.classSection.findFirst({
      where: { teacherId: id.data.id },
      select: { id: true },
    })
    if (assignedClass) {
      redirect(
        errorTarget + 'Deactivate+this+teacher+from+their+schedule+page+to+preserve+history.'
      )
    }
    await tx.user.update({
      where: { id: id.data.id, role: 'TEACHER', deletedAt: null },
      data: { deletedAt: new Date() },
    })
  })
  revalidatePath('/admin/teachers')
  revalidatePath('/admin/classes')
}
