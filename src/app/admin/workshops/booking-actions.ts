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
import { vancouverMonthKey, vancouverToUtc } from '@/lib/time'
import { clockMinutes } from '@/lib/schemas/workshops'

const RETRY_ERROR = 'The schedule changed. Reload and try again.'

function readInput(formData: FormData) {
  return workshopBookingSchema.safeParse({
    requestKey: formData.get('requestKey'),
    workshopDefinitionId: formData.get('workshopDefinitionId'),
    schoolChoice: formData.get('schoolChoice'),
    schoolName: formData.get('schoolName') ?? '',
    teacherChoice: formData.get('teacherChoice'),
    teacherName: formData.get('teacherName') ?? '',
    teacherEmail: formData.get('teacherEmail') ?? '',
    classChoice: formData.get('classChoice') ?? NEW_CHOICE,
    className: formData.get('className') ?? '',
    date: formData.get('date'),
    startTime: formData.get('startTime'),
    endTime: formData.get('endTime'),
    minPAs: formData.get('minPAs'),
    maxPAs: formData.get('maxPAs'),
    mode: formData.get('mode') ?? undefined,
    location: formData.get('location') ?? '',
    notes: formData.get('notes') ?? '',
    participantInstructions: formData.get('participantInstructions') ?? '',
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
    workshopDefinitionId: input.workshopDefinitionId,
    school:
      input.schoolChoice === NEW_CHOICE
        ? { name: normalized(input.schoolName) }
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
    mode: input.mode,
    location: input.location,
    notes: input.notes,
    participantInstructions: input.participantInstructions,
  }
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

type BookingResult = {
  workshopSessionId: string
  schoolId: string
  classSectionId: string
  month: string
}

async function resolveExistingClass(tx: Prisma.TransactionClient, input: WorkshopBookingInput) {
  const cls = await tx.classSection.findUnique({
    where: { id: input.classChoice },
    include: { school: true },
  })
  if (!cls || cls.archivedAt !== null || cls.school.deletedAt !== null)
    throw new SchedulingError('Select an active teacher at the selected school.')
  const teacherId = cls.teacherId
  const teacher = await tx.user.findFirst({
    where: { id: teacherId, deletedAt: null, role: 'TEACHER', schoolId: cls.schoolId },
    select: { id: true },
  })
  if (!teacher)
    throw new SchedulingError('The teacher is unavailable at this school on the selected date.')
  if (input.schoolChoice !== cls.schoolId || input.teacherChoice !== teacherId)
    throw new SchedulingError('The selected teacher no longer matches this school or schedule.')
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
    select: { id: true, name: true },
  })
  const found = schools.find((school) => normalized(school.name) === normalized(input.schoolName))
  if (found) return found.id
  return (
    await tx.school.create({
      data: { name: input.schoolName },
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
    throw new SchedulingError('The selected teacher no longer matches this school or schedule.')
  const classes = await tx.classSection.findMany({
    where: { schoolId, archivedAt: null },
    select: { id: true, name: true, teacherId: true },
  })
  const found = classes.find((cls) => cls.teacherId === teacherId)
  if (found) return found.id
  const existing = await tx.classSection.findFirst({ where: { teacherId } })
  if (existing)
    throw new SchedulingError('Reactivate this teacher before scheduling another session.')
  const teacher = await tx.user.findFirstOrThrow({
    where: { id: teacherId, role: 'TEACHER', deletedAt: null },
  })
  return (
    await tx.classSection.create({
      data: { name: teacher.name ?? teacher.email, schoolId, teacherId },
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
            scheduledStart: true,
            classWorkshop: {
              select: { classSectionId: true, classSection: { select: { schoolId: true } } },
            },
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
        workshopSessionId: workshop.id,
        classSectionId: workshop.classWorkshop.classSectionId,
        schoolId: workshop.classWorkshop.classSection.schoolId,
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

    const definition = await tx.workshopDefinition.findUnique({
      where: { id: input.workshopDefinitionId },
    })
    if (!definition || definition.identityStatus !== 'IDENTIFIED')
      throw new SchedulingError('Select an identified workshop run.')
    const classWorkshop = await tx.classWorkshop.upsert({
      where: {
        classSectionId_workshopDefinitionId: {
          classSectionId,
          workshopDefinitionId: definition.id,
        },
      },
      create: { classSectionId, workshopDefinitionId: definition.id },
      update: {},
    })
    // Direct booking records the admin's confirmed candidate and the dated
    // session atomically. It never implies recurring or other-workshop availability.
    const start = vancouverToUtc(input.date, clockMinutes(input.startTime))
    const end = vancouverToUtc(input.date, clockMinutes(input.endTime))
    await tx.availabilitySlot.upsert({
      where: { classWorkshopId_start_end: { classWorkshopId: classWorkshop.id, start, end } },
      create: {
        classWorkshopId: classWorkshop.id,
        start,
        end,
        notes: 'Date confirmed by admin during direct booking.',
      },
      update: {},
    })
    const month = input.date.slice(0, 7)
    const batch = await tx.workshopBatch.create({
      data: { requestKey: input.requestKey, actorId, month, payloadHash: hash },
      select: { id: true },
    })
    const slot = await validateSlot(
      tx,
      {
        classSectionId,
        workshopDefinitionId: definition.id,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        minPAs: input.minPAs,
        maxPAs: input.maxPAs,
      },
      undefined,
      { hostingConfirmed: true }
    )
    const workshop = await tx.workshopSession.create({
      data: {
        ...slot,
        batchId: batch.id,
        mode: input.mode,
        location: input.location || null,
        notes: input.notes || null,
        participantInstructions: input.participantInstructions || null,
      },
      select: { id: true },
    })
    await tx.classWorkshop.update({
      where: { id: classWorkshop.id },
      data: { status: 'SCHEDULED', revision: { increment: 1 } },
    })
    return { workshopSessionId: workshop.id, schoolId, classSectionId, month }
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
      `/admin/workshops/${result.workshopSessionId}`,
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
