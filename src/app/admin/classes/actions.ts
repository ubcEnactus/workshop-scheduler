'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  classMeetingIdSchema,
  classMeetingSchema,
  classSectionIdSchema,
  classSectionSchema,
} from '@/lib/schemas/classes'

function timeToMinutes(time: unknown): number {
  if (typeof time !== 'string') return NaN
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function toNumber(value: unknown): number {
  return typeof value === 'string' && value !== '' ? Number(value) : NaN
}

async function getTeacherSchoolId(teacherId: string): Promise<string | null> {
  const teacher = await prisma.user.findFirst({
    where: {
      id: teacherId,
      role: 'TEACHER',
      deletedAt: null,
      school: { deletedAt: null },
    },
    select: { schoolId: true },
  })
  return teacher?.schoolId ?? null
}

export async function createClassSection(formData: FormData) {
  await requireRole('ADMIN')
  const parsed = classSectionSchema.safeParse({
    name: formData.get('name'),
    subject: formData.get('subject') || undefined,
    grade: formData.get('grade') || undefined,
    teacherId: formData.get('teacherId'),
  })
  if (!parsed.success) {
    redirect(`/admin/classes?error=${encodeURIComponent(parsed.error.issues[0].message)}`)
  }
  const schoolId = await getTeacherSchoolId(parsed.data.teacherId)
  if (!schoolId) redirect('/admin/classes?error=Select+an+active+teacher+with+a+school.')

  await prisma.classSection.create({ data: { ...parsed.data, schoolId } })
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
  })
  if (!parsed.success) {
    redirect(
      `/admin/classes/${id.data.id}/edit?error=${encodeURIComponent(parsed.error.issues[0].message)}`
    )
  }

  const schoolId = await getTeacherSchoolId(parsed.data.teacherId)
  if (!schoolId) {
    redirect(`/admin/classes/${id.data.id}/edit?error=Select+an+active+teacher+with+a+school.`)
  }

  await prisma.classSection.update({
    where: { id: id.data.id },
    data: { ...parsed.data, schoolId },
  })
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
            "This class has workshop history and can't be deleted. Keep it for now."
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
    dayOfWeek: toNumber(formData.get('dayOfWeek')),
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

  const cls = await prisma.classSection.findFirst({
    where: {
      id: parsed.data.classSectionId,
      teacher: { deletedAt: null },
      school: { deletedAt: null },
    },
    select: { id: true },
  })
  if (!cls) redirect('/admin/classes?error=Unknown+or+inactive+class.')

  const overlap = await prisma.classMeeting.findFirst({
    where: {
      classSectionId: parsed.data.classSectionId,
      dayOfWeek: parsed.data.dayOfWeek,
      startMinute: { lt: parsed.data.endMinute },
      endMinute: { gt: parsed.data.startMinute },
    },
    select: { id: true },
  })
  if (overlap) {
    redirect(
      `/admin/classes/${parsed.data.classSectionId}/edit?error=Meeting+times+cannot+overlap.`
    )
  }
  await prisma.classMeeting.create({ data: parsed.data })
  revalidatePath(`/admin/classes/${parsed.data.classSectionId}/edit`)
}

export async function deleteMeeting(formData: FormData) {
  await requireRole('ADMIN')
  const parsed = classMeetingIdSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) {
    redirect('/admin/classes?error=Unknown+meeting+time.')
  }
  const meeting = await prisma.classMeeting.delete({ where: { id: parsed.data.id } })
  revalidatePath(`/admin/classes/${meeting.classSectionId}/edit`)
}
