'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { requireRole } from '@/lib/auth'
import { readSchedulingContext, schedulingHref } from '@/lib/scheduling/navigation'
import { parsePlanningReturn, preservePlanningReturn } from '@/lib/scheduling/planning-return'
import { scheduleTransaction, SchedulingError } from '@/lib/scheduling/store'
import {
  classMeetingIdSchema,
  classMeetingSchema,
  classSectionIdSchema,
  classSectionSchema,
  classLifecycleSchema,
} from '@/lib/schemas/classes'

function timeToMinutes(time: unknown): number {
  if (typeof time !== 'string') return NaN
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function toNumber(value: unknown): number {
  return typeof value === 'string' && value !== '' ? Number(value) : NaN
}

function classEditTarget(id: string, formData: FormData) {
  const base = `/admin/classes/${id}/edit`
  if (!formData.has('month') && !formData.has('planning')) return base
  return preservePlanningReturn(schedulingHref(base, readSchedulingContext(formData)), formData)
}

function classEditError(id: string, formData: FormData, message: string) {
  const target = classEditTarget(id, formData)
  return `${target}${target.includes('?') ? '&' : '?'}error=${encodeURIComponent(message)}`
}

function classPageTarget(id: string, formData: FormData) {
  return schedulingHref(`/admin/classes/${id}`, {
    ...readSchedulingContext(formData),
    classSectionId: id,
  })
}

function withQuery(path: string, key: string, value: string) {
  return `${path}${path.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`
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
  const directoryTarget = schedulingHref('/admin/classes', readSchedulingContext(formData))
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
    redirect(withQuery(directoryTarget, 'error', parsed.error.issues[0].message))
  }
  let createdId = ''
  try {
    createdId = await scheduleTransaction(async (tx) => {
      const schoolId = await getTeacherSchoolId(tx, parsed.data.teacherId)
      if (!schoolId) throw new SchedulingError('Select an active teacher with a school.')
      const existing = await tx.classSection.findFirst({
        where: { teacherId: parsed.data.teacherId },
      })
      if (existing) return existing.id
      const teacher = await tx.user.findFirstOrThrow({
        where: { id: parsed.data.teacherId, deletedAt: null, role: 'TEACHER' },
      })
      const created = await tx.classSection.create({
        data: { ...parsed.data, name: teacher.name ?? teacher.email, schoolId },
      })
      return created.id
    })
  } catch (error) {
    if (error instanceof SchedulingError)
      redirect(withQuery(directoryTarget, 'error', error.message))
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      redirect(withQuery(directoryTarget, 'error', 'Records changed. Reload and try again.'))
    }
    throw error
  }
  revalidatePath('/admin/classes')
  redirect(
    schedulingHref(
      `/admin/classes/${createdId}`,
      { ...readSchedulingContext(formData), classSectionId: createdId },
      { saved: 'created' }
    ) + '#availability'
  )
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
    redirect(classEditError(id.data.id, formData, parsed.error.issues[0].message))
  }

  try {
    const error = await scheduleTransaction(async (tx) => {
      const schoolId = await getTeacherSchoolId(tx, parsed.data.teacherId)
      if (!schoolId) return 'Select an active teacher with a school.'
      const cls = await tx.classSection.findUnique({
        where: { id: id.data.id },
      })
      if (!cls) return 'Unknown teacher.'
      if (cls.teacherId !== parsed.data.teacherId)
        return 'Each teacher owns their schedule. Enroll the other teacher separately.'
      if (cls.schoolId !== schoolId)
        return 'Moving a teacher to another school is a separate operation.'
      await tx.classSection.update({
        where: { id: cls.id },
        data: {
          ...parsed.data,
          name: cls.name,
          subject: parsed.data.subject ?? null,
          grade: parsed.data.grade ?? null,
          schoolId,
        },
      })
      return null
    })
    if (error) redirect(classEditError(id.data.id, formData, error))
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      redirect(classEditError(id.data.id, formData, 'Records changed. Reload and try again.'))
    }
    throw error
  }
  redirect(
    parsePlanningReturn(formData)
      ? classEditTarget(id.data.id, formData)
      : withQuery(classPageTarget(id.data.id, formData), 'saved', 'details')
  )
}

export async function deleteClassSection(formData: FormData) {
  await requireRole('ADMIN')
  const id = classSectionIdSchema.safeParse({ id: formData.get('id') })
  if (!id.success) {
    redirect('/admin/classes?error=Unknown+class.')
  }

  redirect(
    withQuery(
      classPageTarget(id.data.id, formData),
      'error',
      'This schedule belongs to its teacher. Deactivate the teacher to preserve workshop history.'
    )
  )
}

export async function updateClassLifecycle(formData: FormData) {
  await requireRole('ADMIN')
  const parsed = classLifecycleSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/admin/classes?error=Unknown+class+lifecycle+action.')
  const target = classPageTarget(parsed.data.id, formData)
  try {
    await scheduleTransaction(async (tx) => {
      const cls = await tx.classSection.findFirst({
        where: { id: parsed.data.id, school: { deletedAt: null } },
        include: {
          classWorkshops: {
            include: {
              sessions: {
                where: {
                  status: { in: ['DRAFT', 'PUBLISHED'] },
                  scheduledEnd: { gte: new Date() },
                },
                select: { id: true },
              },
            },
          },
        },
      })
      if (!cls) throw new SchedulingError('Unknown teacher.')
      if (cls.updatedAt.toISOString() !== parsed.data.expectedUpdatedAt)
        throw new SchedulingError('This teacher changed. Reload and review its status again.')
      if (parsed.data.action === 'REACTIVATE') {
        await tx.classSection.update({ where: { id: cls.id }, data: { archivedAt: null } })
        return
      }
      const futureSessions = cls.classWorkshops.flatMap((run) => run.sessions)
      const unresolved = cls.classWorkshops.filter(
        (run) => !['COMPLETED', 'WAIVED'].includes(run.status)
      )
      if (futureSessions.length || unresolved.length)
        throw new SchedulingError(
          'Resolve future sessions, remaining workshop obligations before deactivating this teacher. Cancel future sessions, and complete or mark each outstanding delivery not required.'
        )
      await tx.classSection.update({ where: { id: cls.id }, data: { archivedAt: new Date() } })
    })
  } catch (error) {
    if (error instanceof SchedulingError) redirect(withQuery(target, 'error', error.message))
    throw error
  }
  revalidatePath('/admin', 'layout')
  redirect(withQuery(target, 'saved', 'lifecycle'))
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
        ? classEditTarget(classSectionId, formData)
        : '/admin/classes'
    redirect(
      `${target}${target.includes('?') ? '&' : '?'}error=${encodeURIComponent(parsed.error.issues[0].message)}`
    )
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
        classEditError(parsed.data.classSectionId, formData, 'Availability blocks cannot overlap.')
      )
    }
    await tx.classMeeting.create({ data: parsed.data })
  })
  revalidatePath(`/admin/classes/${parsed.data.classSectionId}/edit`)
  if (formData.has('month') || formData.has('planning'))
    redirect(classEditTarget(parsed.data.classSectionId, formData))
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
