'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { classSectionSchema, classSectionIdSchema, classMeetingSchema } from '@/lib/schemas/classes'

function timeToMinutes(time: unknown): number {
  if (typeof time !== 'string') return NaN
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export async function createClassSection(formData: FormData) {
  await requireRole('ADMIN')
  const parsed = classSectionSchema.safeParse({
    name: formData.get('name'),
    subject: formData.get('subject') || undefined,
    grade: formData.get('grade') || undefined,
    teacherId: formData.get('teacherId'),
    schoolId: formData.get('schoolId'),
  })
  if (!parsed.success) {
    redirect(`/admin/classes?error=${encodeURIComponent(parsed.error.issues[0].message)}`)
  }
  await prisma.classSection.create({ data: parsed.data })
  revalidatePath('/admin/classes')
}

export async function updateClassSection(formData: FormData) {
  await requireRole('ADMIN')
  const id = classSectionIdSchema.safeParse({ id: formData.get('id') })
  if (!id.success) {
    redirect('/admin/classes?error=Unknown+class.')
  }

  const parsed = classSectionSchema.safeParse({
    name: formData.get('name'),
    subject: formData.get('subject') || undefined,
    grade: formData.get('grade') || undefined,
    teacherId: formData.get('teacherId'),
    schoolId: formData.get('schoolId'),
  })
  if (!parsed.success) {
    redirect(
      `/admin/classes/${id.data.id}/edit?error=${encodeURIComponent(parsed.error.issues[0].message)}`
    )
  }

  await prisma.classSection.update({ where: { id: id.data.id }, data: parsed.data })
  redirect('/admin/classes')
}

export async function deleteClassSection(formData: FormData) {
  await requireRole('ADMIN')
  const id = classSectionIdSchema.safeParse({ id: formData.get('id') })
  if (!id.success) {
    redirect('/admin/classes?error=Unknown+class.')
  }

  try {
    await prisma.classSection.delete({ where: { id: id.data.id } })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      redirect(
        '/admin/classes?error=' +
          encodeURIComponent(
            "This class has workshops in a cycle and can't be deleted. Remove it from the cycle first."
          )
      )
    }
    throw err
  }
  revalidatePath('/admin/classes')
}

export async function addMeeting(formData: FormData) {
  await requireRole('ADMIN')
  const classSectionId = formData.get('classSectionId')
  const parsed = classMeetingSchema.safeParse({
    classSectionId,
    dayOfWeek: Number(formData.get('dayOfWeek')),
    startMinute: timeToMinutes(formData.get('startTime')),
    endMinute: timeToMinutes(formData.get('endTime')),
  })
  if (!parsed.success) {
    const target =
      typeof classSectionId === 'string'
        ? `/admin/classes/${classSectionId}/edit`
        : '/admin/classes'
    redirect(`${target}?error=${encodeURIComponent(parsed.error.issues[0].message)}`)
  }
  await prisma.classMeeting.create({ data: parsed.data })
  revalidatePath(`/admin/classes/${parsed.data.classSectionId}/edit`)
}

export async function deleteMeeting(formData: FormData) {
  await requireRole('ADMIN')
  const parsed = z.object({ id: z.string().min(1) }).safeParse({ id: formData.get('id') })
  if (!parsed.success) {
    redirect('/admin/classes?error=Unknown+meeting+time.')
  }
  const meeting = await prisma.classMeeting.delete({ where: { id: parsed.data.id } })
  revalidatePath(`/admin/classes/${meeting.classSectionId}/edit`)
}
