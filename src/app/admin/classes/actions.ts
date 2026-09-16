'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { requireRole } from '@/lib/auth'
import { scheduleTransaction } from '@/lib/scheduling/store'
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

async function getTeacherSchoolId(
  tx: Prisma.TransactionClient,
  teacherId: string
): Promise<string | null> {
  const teacher = await tx.user.findFirst({
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
    monthlyCadence: formData.get('monthlyCadence') ?? undefined,
    defaultDurationMinutes: formData.get('defaultDurationMinutes') ?? undefined,
    defaultMinPAs: formData.get('defaultMinPAs') ?? undefined,
    defaultMaxPAs: formData.get('defaultMaxPAs') ?? undefined,
  })
  if (!parsed.success) {
    redirect(`/admin/classes?error=${encodeURIComponent(parsed.error.issues[0].message)}`)
  }
  try {
    await scheduleTransaction(async (tx) => {
      const schoolId = await getTeacherSchoolId(tx, parsed.data.teacherId)
      if (!schoolId) redirect('/admin/classes?error=Select+an+active+teacher+with+a+school.')
      await tx.classSection.create({ data: { ...parsed.data, schoolId } })
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      redirect('/admin/classes?error=Records+changed.+Reload+and+try+again.')
    }
    throw error
  }
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
    monthlyCadence: formData.get('monthlyCadence') ?? undefined,
    defaultDurationMinutes: formData.get('defaultDurationMinutes') ?? undefined,
    defaultMinPAs: formData.get('defaultMinPAs') ?? undefined,
    defaultMaxPAs: formData.get('defaultMaxPAs') ?? undefined,
  })
  if (!parsed.success) {
    redirect(
      `/admin/classes/${id.data.id}/edit?error=${encodeURIComponent(parsed.error.issues[0].message)}`
    )
  }

  try {
    const error = await scheduleTransaction(async (tx) => {
      const schoolId = await getTeacherSchoolId(tx, parsed.data.teacherId)
      if (!schoolId) return 'Select an active teacher with a school.'
      const cls = await tx.classSection.findUnique({
        where: { id: id.data.id },
        include: { _count: { select: { workshops: true } } },
      })
      if (!cls) return 'Unknown class.'
      if (
        cls._count.workshops > 0 &&
        (cls.teacherId !== parsed.data.teacherId || cls.schoolId !== schoolId)
      ) {
        return 'This class has workshop history. Create a new class for a different teacher or school.'
      }
      await tx.classSection.update({
        where: { id: cls.id },
        data: {
          ...parsed.data,
          subject: parsed.data.subject ?? null,
          grade: parsed.data.grade ?? null,
          schoolId,
        },
      })
      return null
    })
    if (error) redirect(`/admin/classes/${id.data.id}/edit?error=${encodeURIComponent(error)}`)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      redirect(`/admin/classes/${id.data.id}/edit?error=Records+changed.+Reload+and+try+again.`)
    }
    throw error
  }
  redirect('/admin/classes')
}

export async function deleteClassSection(formData: FormData) {
  await requireRole('ADMIN')
  const id = classSectionIdSchema.safeParse({ id: formData.get('id') })
  if (!id.success) {
    redirect('/admin/classes?error=Unknown+class.')
  }

  try {
    await scheduleTransaction((tx) => tx.classSection.delete({ where: { id: id.data.id } }))
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

  await scheduleTransaction(async (tx) => {
    const cls = await tx.classSection.findFirst({
      where: {
        id: parsed.data.classSectionId,
        teacher: { deletedAt: null },
        school: { deletedAt: null },
      },
      select: { id: true },
    })
    if (!cls) redirect('/admin/classes?error=Unknown+or+inactive+class.')

    const overlap = await tx.classMeeting.findFirst({
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
        `/admin/classes/${parsed.data.classSectionId}/edit?error=Availability+blocks+cannot+overlap.`
      )
    }
    await tx.classMeeting.create({ data: parsed.data })
  })
  revalidatePath(`/admin/classes/${parsed.data.classSectionId}/edit`)
}

export async function deleteMeeting(formData: FormData) {
  await requireRole('ADMIN')
  const parsed = classMeetingIdSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) {
    redirect('/admin/classes?error=Unknown+availability+block.')
  }
  const meeting = await scheduleTransaction((tx) =>
    tx.classMeeting.delete({ where: { id: parsed.data.id } })
  )
  revalidatePath(`/admin/classes/${meeting.classSectionId}/edit`)
}
