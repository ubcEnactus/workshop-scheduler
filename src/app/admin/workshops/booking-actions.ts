'use server'

import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import type { WorkshopFormState } from '@/lib/schemas/form-state'
import { NEW_CHOICE, workshopBookingSchema, type WorkshopBookingInput } from '@/lib/schemas/booking'
import { schedulingHref } from '@/lib/scheduling/navigation'
import { scheduleTransaction, SchedulingError, validateSlot } from '@/lib/scheduling/store'
import { vancouverMonthKey } from '@/lib/time'

const RETRY_ERROR = 'The schedule changed. Reload and try again.'

function readInput(formData: FormData) {
  return workshopBookingSchema.safeParse({
    requestKey: formData.get('requestKey'),
    schoolChoice: formData.get('schoolChoice'),
    schoolName: formData.get('schoolName') ?? '',
    schoolDistrict: formData.get('schoolDistrict') ?? '',
    teacherChoice: formData.get('teacherChoice'),
    teacherName: formData.get('teacherName') ?? '',
    teacherEmail: formData.get('teacherEmail') ?? '',
    classChoice: formData.get('classChoice'),
    className: formData.get('className') ?? '',
    date: formData.get('date'),
    startTime: formData.get('startTime'),
    endTime: formData.get('endTime'),
    minPAs: formData.get('minPAs'),
    maxPAs: formData.get('maxPAs'),
    month: formData.get('month') ?? undefined,
    schoolId: formData.get('schoolId'),
    returnClassSectionId: formData.get('returnClassSectionId'),
    view: formData.get('view') ?? undefined,
  })
}

function normalized(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-CA')
}

function payloadHash(input: WorkshopBookingInput) {
  const payload = {
    school:
      input.schoolChoice === NEW_CHOICE
        ? { name: normalized(input.schoolName), district: normalized(input.schoolDistrict) }
        : { id: input.schoolChoice },
    teacher:
      input.teacherChoice === NEW_CHOICE
        ? { name: normalized(input.teacherName), email: input.teacherEmail }
        : { id: input.teacherChoice },
    classSection:
      input.classChoice === NEW_CHOICE
        ? { name: normalized(input.className) }
        : { id: input.classChoice },
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    minPAs: input.minPAs,
    maxPAs: input.maxPAs,
  }
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

type BookingResult = {
  workshopId: string
  schoolId: string
  classSectionId: string
  month: string
}

async function resolveExistingClass(tx: Prisma.TransactionClient, input: WorkshopBookingInput) {
  const cls = await tx.classSection.findUnique({
    where: { id: input.classChoice },
    include: { teacher: true, school: true },
  })
  if (
    !cls ||
    cls.school.deletedAt !== null ||
    cls.teacher.deletedAt !== null ||
    cls.teacher.role !== 'TEACHER' ||
    cls.teacher.schoolId !== cls.schoolId
  )
    throw new SchedulingError('Select an active class with a teacher at its school.')
  if (input.schoolChoice !== cls.schoolId || input.teacherChoice !== cls.teacherId)
    throw new SchedulingError('The selected school, teacher, and class no longer match.')
  return { classSectionId: cls.id, schoolId: cls.schoolId }
}

async function resolveSchool(tx: Prisma.TransactionClient, input: WorkshopBookingInput) {
  if (input.schoolChoice !== NEW_CHOICE) {
    const school = await tx.school.findFirst({
      where: { id: input.schoolChoice, deletedAt: null },
      select: { id: true },
    })
    if (!school) throw new SchedulingError('Select an active school.')
    return school.id
  }
  const schools = await tx.school.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, district: true },
  })
  const found = schools.find(
    (school) =>
      normalized(school.name) === normalized(input.schoolName) &&
      normalized(school.district) === normalized(input.schoolDistrict)
  )
  if (found) return found.id
  return (
    await tx.school.create({
      data: { name: input.schoolName, district: input.schoolDistrict },
      select: { id: true },
    })
  ).id
}

async function resolveTeacher(
  tx: Prisma.TransactionClient,
  input: WorkshopBookingInput,
  schoolId: string
) {
  if (input.teacherChoice !== NEW_CHOICE) {
    const teacher = await tx.user.findFirst({
      where: {
        id: input.teacherChoice,
        role: 'TEACHER',
        deletedAt: null,
        schoolId,
      },
      select: { id: true },
    })
    if (!teacher) throw new SchedulingError('Select an active teacher at the selected school.')
    return teacher.id
  }
  const matches = await tx.user.findMany({
    where: { email: { equals: input.teacherEmail, mode: 'insensitive' } },
    select: { id: true, role: true, deletedAt: true, schoolId: true },
  })
  if (matches.length > 0) {
    const existing = matches[0]
    if (
      matches.length !== 1 ||
      existing.role !== 'TEACHER' ||
      existing.deletedAt !== null ||
      existing.schoolId !== schoolId
    )
      throw new SchedulingError('That email belongs to another or inactive account.')
    return existing.id
  }
  return (
    await tx.user.create({
      data: {
        name: input.teacherName,
        email: input.teacherEmail,
        role: 'TEACHER',
        schoolId,
      },
      select: { id: true },
    })
  ).id
}

async function resolveClass(
  tx: Prisma.TransactionClient,
  input: WorkshopBookingInput,
  schoolId: string,
  teacherId: string
) {
  if (input.classChoice !== NEW_CHOICE)
    throw new SchedulingError('The selected school, teacher, and class no longer match.')
  const classes = await tx.classSection.findMany({
    where: { schoolId, teacherId },
    select: { id: true, name: true },
  })
  const found = classes.find((cls) => normalized(cls.name) === normalized(input.className))
  if (found) return found.id
  return (
    await tx.classSection.create({
      data: { name: input.className, schoolId, teacherId },
      select: { id: true },
    })
  ).id
}

async function saveBooking(actorId: string, input: WorkshopBookingInput): Promise<BookingResult> {
  const hash = payloadHash(input)
  return scheduleTransaction(async (tx) => {
    const prior = await tx.workshopBatch.findUnique({
      where: { requestKey: input.requestKey },
      include: {
        workshops: {
          select: {
            id: true,
            classSectionId: true,
            scheduledStart: true,
            classSection: { select: { schoolId: true } },
          },
        },
      },
    })
    if (prior) {
      if (prior.actorId !== actorId || prior.payloadHash !== hash)
        throw new SchedulingError(
          'This request key was already used for different workshop choices. Reload and try again.'
        )
      const workshop = prior.workshops[0]
      if (!workshop || prior.workshops.length !== 1)
        throw new SchedulingError('This booking could not be recovered. Reload and try again.')
      return {
        workshopId: workshop.id,
        classSectionId: workshop.classSectionId,
        schoolId: workshop.classSection.schoolId,
        month: vancouverMonthKey(workshop.scheduledStart),
      }
    }

    let schoolId: string
    let classSectionId: string
    if (input.classChoice !== NEW_CHOICE) {
      const resolved = await resolveExistingClass(tx, input)
      schoolId = resolved.schoolId
      classSectionId = resolved.classSectionId
    } else {
      schoolId = await resolveSchool(tx, input)
      const teacherId = await resolveTeacher(tx, input, schoolId)
      classSectionId = await resolveClass(tx, input, schoolId, teacherId)
    }

    const month = input.date.slice(0, 7)
    const batch = await tx.workshopBatch.create({
      data: { requestKey: input.requestKey, actorId, month, payloadHash: hash },
      select: { id: true },
    })
    const slot = await validateSlot(
      tx,
      {
        classSectionId,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        minPAs: input.minPAs,
        maxPAs: input.maxPAs,
      },
      undefined,
      { hostingConfirmed: true }
    )
    const workshop = await tx.workshop.create({
      data: { ...slot, batchId: batch.id },
      select: { id: true },
    })
    return { workshopId: workshop.id, schoolId, classSectionId, month }
  })
}

export async function createWorkshopBooking(
  _state: WorkshopFormState,
  formData: FormData
): Promise<WorkshopFormState> {
  const actor = await requireRole('ADMIN')
  const parsed = readInput(formData)
  if (!parsed.success)
    return {
      error: parsed.error.issues[0].message,
      fields: Object.fromEntries(
        parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])
      ),
    }

  let result: BookingResult
  try {
    result = await saveBooking(actor.id, parsed.data)
  } catch (error) {
    if (error instanceof SchedulingError) return { error: error.message }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2034') return { error: RETRY_ERROR }
      if (error.code === 'P2002')
        return {
          error: 'That school, teacher, or request was created elsewhere. Reload and try again.',
        }
    }
    throw error
  }

  revalidatePath('/admin')
  revalidatePath('/admin/schools')
  revalidatePath('/admin/teachers')
  revalidatePath('/admin/classes')
  revalidatePath('/admin/workshops', 'layout')
  redirect(
    schedulingHref(
      `/admin/workshops/${result.workshopId}`,
      {
        month: result.month,
        schoolId: result.schoolId,
        classSectionId: result.classSectionId,
        view: 'all',
      },
      { saved: '1' }
    )
  )
}
