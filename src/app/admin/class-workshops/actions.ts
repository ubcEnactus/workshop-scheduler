'use server'

import { Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import type { z } from 'zod'
import { requireRole } from '@/lib/auth'
import {
  classWorkshopSchema,
  definitionSchema,
  availabilitySlotSchema,
  removeAvailabilitySchema,
  scheduleCandidateSchema,
  identifyClassWorkshopSchema,
  duplicateDefinitionSchema,
  enrollmentSelectionSchema,
  classWorkshopLifecycleSchema,
  deleteWorkshopDefinitionSchema,
} from '@/lib/schemas/class-workshops'
import { workshopSchema, clockMinutes } from '@/lib/schemas/workshops'
import { scheduleTransaction, SchedulingError, validateSlot } from '@/lib/scheduling/store'
import { vancouverDateKey, vancouverMonthKey, vancouverToUtc } from '@/lib/time'
import { withinDeliveryWindow } from '@/lib/scheduling/delivery-windows'
import { sessionsNeedingDateExceptions } from '@/lib/scheduling/class-workshops'
import { schedulingHref } from '@/lib/scheduling/navigation'
import {
  summarizeWorkshopDeletion,
  workshopDeletionInclude,
} from '@/lib/scheduling/workshop-deletion'

function fail(error: unknown, target: string): never {
  if (error instanceof SchedulingError)
    redirect(
      target + (target.includes('?') ? '&' : '?') + 'error=' + encodeURIComponent(error.message)
    )
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ['P2002', 'P2034'].includes(error.code)
  )
    redirect(
      target +
        (target.includes('?') ? '&' : '?') +
        'error=' +
        encodeURIComponent('This record already exists or changed. Reload and try again.')
    )
  throw error
}
function refresh() {
  revalidatePath('/admin', 'layout')
  revalidatePath('/pa')
  revalidatePath('/teacher')
}
async function activeClassWorkshop(
  tx: Prisma.TransactionClient,
  id: string,
  options: { requireCurrentTeacher?: boolean } = {}
) {
  const record = await tx.classWorkshop.findFirst({
    where: {
      id,
      classSection: {
        archivedAt: null,
        school: { deletedAt: null },
      },
    },
    include: {
      classSection: { include: {} },
      workshopDefinition: { select: { defaultMinPAs: true, defaultMaxPAs: true } },
      sessions: { where: { status: { not: 'CANCELLED' } } },
    },
  })
  if (!record) throw new SchedulingError('Select an active teacher workshop.')
  if (options.requireCurrentTeacher === false) return record
  const teacherId = record.classSection.teacherId
  const teacher = await tx.user.findFirst({
    where: {
      id: teacherId,
      role: 'TEACHER',
      deletedAt: null,
      schoolId: record.classSection.schoolId,
    },
    select: { id: true },
  })
  if (!teacher) throw new SchedulingError('Select an active teacher workshop.')
  return record
}

type DefinitionInput = z.infer<typeof definitionSchema>

function definitionData(input: DefinitionInput) {
  return {
    number: input.number ?? null,
    title: input.title,
    description: input.description || null,
    durationMinutes: input.durationMinutes,
    defaultMinPAs: input.defaultMinPAs,
    defaultMaxPAs: input.defaultMaxPAs,
    identityStatus: 'IDENTIFIED' as const,
    deliveryStartsOn: input.deliveryStart ? new Date(input.deliveryStart + 'T00:00:00Z') : null,
    deliveryEndsOn: input.deliveryEnd ? new Date(input.deliveryEnd + 'T00:00:00Z') : null,
  } satisfies Prisma.WorkshopDefinitionCreateInput
}

export async function createWorkshopDefinition(
  form: FormData
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireRole('ADMIN')
  const parsed = definitionSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  if (parsed.data.id !== undefined)
    return { ok: false, error: 'Create a new workshop without an existing workshop ID.' }

  try {
    const created = await scheduleTransaction((tx) =>
      tx.workshopDefinition.create({
        data: definitionData(parsed.data),
        select: { id: true },
      })
    )
    return { ok: true, id: created.id }
  } catch (error) {
    if (error instanceof SchedulingError) return { ok: false, error: error.message }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2034'].includes(error.code)
    )
      return { ok: false, error: 'This record already exists or changed. Reload and try again.' }
    throw error
  }
}

export async function saveWorkshopDefinition(form: FormData) {
  const actor = await requireRole('ADMIN')
  const parsed = definitionSchema.safeParse(Object.fromEntries(form))
  const target =
    parsed.success && parsed.data.id && parsed.data.returnToOverview
      ? `/admin/workshop-definitions/${encodeURIComponent(parsed.data.id)}?view=overview`
      : '/admin/workshop-definitions'
  if (!parsed.success)
    redirect(target + '?error=' + encodeURIComponent(parsed.error.issues[0].message))
  let destination = target + (target.includes('?') ? '&detailsSaved=1' : '?saved=1')
  try {
    const result = await scheduleTransaction(async (tx) => {
      const { id, expectedUpdatedAt, ...fields } = parsed.data
      const data = definitionData(parsed.data)
      if (id) {
        const current = await tx.workshopDefinition.findUnique({ where: { id } })
        if (
          !current ||
          (expectedUpdatedAt && current.updatedAt.toISOString() !== expectedUpdatedAt)
        )
          throw new SchedulingError('This definition changed. Reload and try again.')
        const sessions = await tx.workshopSession.findMany({
          where: { classWorkshop: { workshopDefinitionId: id }, status: { not: 'CANCELLED' } },
        })
        const affected = sessionsNeedingDateExceptions(data, sessions)
        if (affected.length && !fields.confirmWindowImpact)
          throw new SchedulingError(
            `${affected.length} existing session${affected.length === 1 ? '' : 's'} would fall outside this shared window. Review the workshop, then explicitly preserve those dates as exceptions or resolve them first.`
          )
        if (affected.length && !fields.windowExceptionReason)
          throw new SchedulingError('Enter a reason for preserving affected session dates.')
        for (const session of affected)
          await tx.workshopSession.update({
            where: { id: session.id },
            data: {
              dateExceptionReason: fields.windowExceptionReason,
              dateExceptionApprovedBy: actor.id,
              dateExceptionApprovedAt: new Date(),
              version: { increment: 1 },
            },
          })
      }
      if (id) {
        await tx.workshopDefinition.update({
          where: { id },
          data: { ...data, revision: { increment: 1 } },
        })
        return { id, created: false }
      }
      const created = await tx.workshopDefinition.create({ data })
      return { id: created.id, created: true }
    })
    if (result.created) destination = '/admin/workshop-definitions/' + result.id + '?created=1'
  } catch (error) {
    fail(error, target)
  }
  refresh()
  redirect(destination)
}

export async function duplicateWorkshopDefinition(form: FormData) {
  await requireRole('ADMIN')
  const parsed = duplicateDefinitionSchema.safeParse(Object.fromEntries(form))
  const target = '/admin/workshop-definitions'
  if (!parsed.success)
    redirect(target + '?error=' + encodeURIComponent(parsed.error.issues[0].message))

  let createdId: string
  try {
    createdId = await scheduleTransaction(async (tx) => {
      const source = await tx.workshopDefinition.findUnique({ where: { id: parsed.data.sourceId } })
      if (!source) throw new SchedulingError('The source workshop is no longer available.')
      const deliveryStartsOn = parsed.data.deliveryStart
        ? new Date(parsed.data.deliveryStart + 'T00:00:00Z')
        : null
      const deliveryEndsOn = parsed.data.deliveryEnd
        ? new Date(parsed.data.deliveryEnd + 'T00:00:00Z')
        : null
      return (
        await tx.workshopDefinition.create({
          data: {
            number: parsed.data.number ?? null,
            title: parsed.data.title,
            description: source.description,
            durationMinutes: source.durationMinutes,
            defaultMinPAs: source.defaultMinPAs,
            defaultMaxPAs: source.defaultMaxPAs,
            identityStatus: 'IDENTIFIED',
            deliveryStartsOn,
            deliveryEndsOn,
          },
        })
      ).id
    })
  } catch (error) {
    fail(error, target)
  }
  refresh()
  redirect('/admin/workshop-definitions/' + createdId + '?created=1')
}

export async function deleteWorkshopDefinition(form: FormData) {
  await requireRole('ADMIN')
  const targetId = deleteWorkshopDefinitionSchema.shape.workshopDefinitionId.safeParse(
    form.get('workshopDefinitionId')
  )
  const parsed = deleteWorkshopDefinitionSchema.safeParse(Object.fromEntries(form))
  const fallback = '/admin/workshop-definitions'
  const target = targetId.success
    ? `/admin/workshop-definitions/${encodeURIComponent(targetId.data)}/delete`
    : fallback
  if (!parsed.success)
    redirect(target + '?error=' + encodeURIComponent(parsed.error.issues[0].message))

  let deleted = false
  try {
    deleted = await scheduleTransaction(async (tx) => {
      const current = await tx.workshopDefinition.findUnique({
        where: { id: parsed.data.workshopDefinitionId },
        include: workshopDeletionInclude,
      })
      if (!current) return false
      const summary = summarizeWorkshopDeletion(current)
      if (summary.hash !== parsed.data.expectedHash)
        throw new SchedulingError(
          'This workshop changed after you reviewed it. Reload and review the deletion again.'
        )
      if (summary.blockedReason) throw new SchedulingError(summary.blockedReason)

      const enrollmentIds = current.classWorkshops.map((enrollment) => enrollment.id)
      const sessionIds = current.classWorkshops.flatMap((enrollment) =>
        enrollment.sessions.map((session) => session.id)
      )
      if (sessionIds.length) {
        await tx.assignment.deleteMany({ where: { workshopSessionId: { in: sessionIds } } })
        await tx.workshopChange.deleteMany({ where: { workshopSessionId: { in: sessionIds } } })
        await tx.workshopEvent.deleteMany({ where: { workshopSessionId: { in: sessionIds } } })
        await tx.workshopSession.deleteMany({ where: { id: { in: sessionIds } } })
      }
      if (enrollmentIds.length) {
        await tx.availabilitySlot.deleteMany({
          where: { classWorkshopId: { in: enrollmentIds } },
        })
        await tx.classWorkshop.deleteMany({ where: { id: { in: enrollmentIds } } })
      }
      await tx.workshopDefinition.delete({ where: { id: current.id } })
      return true
    })
  } catch (error) {
    fail(error, target)
  }
  if (!deleted)
    redirect(fallback + '?error=' + encodeURIComponent('Workshop is no longer available.'))
  refresh()
  redirect(fallback + '?deleted=1')
}

function normalizedSelectionHash(runIds: string[], classSectionIds: string[]) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        runIds: [...new Set(runIds)].sort(),
        classSectionIds: [...new Set(classSectionIds)].sort(),
      })
    )
    .digest('hex')
}

export async function enrollClassesInRuns(
  form: FormData
): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  const actor = await requireRole('ADMIN')
  const parsed = enrollmentSelectionSchema.safeParse({
    runIds: form.getAll('runIds'),
    classSectionIds: form.getAll('classSectionIds'),
    requestKey: form.get('requestKey'),
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const runIds = [...new Set(parsed.data.runIds)].sort()
  const classSectionIds = [...new Set(parsed.data.classSectionIds)].sort()
  const payloadHash = normalizedSelectionHash(runIds, classSectionIds)
  let created = 0
  try {
    created = await scheduleTransaction(async (tx) => {
      const prior = await tx.enrollmentBatch.findUnique({
        where: { requestKey: parsed.data.requestKey },
      })
      if (prior) {
        if (prior.payloadHash !== payloadHash)
          throw new SchedulingError(
            'This teacher-selection request key was already used for another selection.'
          )
        return 0
      }
      const [runs, classes] = await Promise.all([
        tx.workshopDefinition.findMany({ where: { id: { in: runIds } }, select: { id: true } }),
        tx.classSection.findMany({
          where: {
            id: { in: classSectionIds },
            archivedAt: null,
            school: { deletedAt: null },
          },
          select: { id: true, schoolId: true, teacherId: true },
        }),
      ])
      if (runs.length !== runIds.length)
        throw new SchedulingError('One or more selected workshops are unavailable.')
      const effectiveTeacherIds = classes.map((cls) => cls.teacherId)
      const activeTeachers = await tx.user.findMany({
        where: { id: { in: effectiveTeacherIds }, role: 'TEACHER', deletedAt: null },
        select: { id: true, schoolId: true },
      })
      if (
        classes.length !== classSectionIds.length ||
        classes.some((cls, index) => {
          const teacher = activeTeachers.find((entry) => entry.id === effectiveTeacherIds[index])
          return teacher?.schoolId !== cls.schoolId
        })
      )
        throw new SchedulingError(
          'One or more selected teachers are inactive or unavailable at their school.'
        )

      await tx.enrollmentBatch.create({
        data: { requestKey: parsed.data.requestKey, actorId: actor.id, payloadHash },
      })
      const result = await tx.classWorkshop.createMany({
        data: runIds.flatMap((workshopDefinitionId) =>
          classSectionIds.map((classSectionId) => ({
            workshopDefinitionId,
            classSectionId,
          }))
        ),
        skipDuplicates: true,
      })
      return result.count
    })
  } catch (error) {
    if (error instanceof SchedulingError) return { ok: false, error: error.message }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2034'].includes(error.code)
    )
      return { ok: false, error: 'This record already exists or changed. Reload and try again.' }
    throw error
  }
  // The client opens a fresh document after this small mutation response. Keep
  // completion independent of Next's revalidation + same-route Flight redirect.
  return { ok: true, created }
}

export async function updateClassWorkshopLifecycle(form: FormData) {
  const actor = await requireRole('ADMIN')
  const parsed = classWorkshopLifecycleSchema.safeParse(Object.fromEntries(form))
  const fallback = '/admin/workshop-definitions'
  if (!parsed.success)
    redirect(fallback + '?error=' + encodeURIComponent(parsed.error.issues[0].message))
  const target = '/admin/workshop-definitions/' + String(form.get('workshopDefinitionId') ?? '')
  try {
    await scheduleTransaction(async (tx) => {
      const record = await tx.classWorkshop.findUnique({
        where: { id: parsed.data.classWorkshopId },
        include: { sessions: true, _count: { select: { availabilitySlots: true } } },
      })
      if (!record || record.revision !== parsed.data.expectedRevision)
        throw new SchedulingError('This included teacher changed. Reload and try again.')
      if (parsed.data.action === 'REMOVE') {
        if (record.sessions.length || record._count.availabilitySlots)
          throw new SchedulingError(
            'This teacher has scheduling history in the workshop. Cancel any active session and mark its delivery not required instead.'
          )
        await tx.classWorkshop.delete({ where: { id: record.id } })
        return
      }
      if (parsed.data.action === 'WAIVE') {
        if (!parsed.data.reason)
          throw new SchedulingError('Enter a reason why this delivery is not required.')
        if (record.sessions.some((session) => session.status !== 'CANCELLED'))
          throw new SchedulingError(
            'Cancel or complete the active session before marking delivery not required.'
          )
        await tx.classWorkshop.update({
          where: { id: record.id },
          data: {
            status: 'WAIVED',
            waivedAt: new Date(),
            waivedById: actor.id,
            waiverReason: parsed.data.reason,
            revision: { increment: 1 },
          },
        })
        return
      }
      await tx.classWorkshop.update({
        where: { id: record.id },
        data: {
          status: record._count.availabilitySlots ? 'READY_TO_SCHEDULE' : 'NEEDS_AVAILABILITY',
          waivedAt: null,
          waivedById: null,
          waiverReason: null,
          revision: { increment: 1 },
        },
      })
    })
  } catch (error) {
    fail(error, target || fallback)
  }
  refresh()
  redirect(target)
}

export async function addClassWorkshop(form: FormData) {
  await requireRole('ADMIN')
  const parsed = classWorkshopSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success)
    redirect('/admin/classes?error=' + encodeURIComponent(parsed.error.issues[0].message))
  const target = '/admin/classes/' + parsed.data.classSectionId
  const returnTarget = parsed.data.returnToClass
    ? schedulingHref(
        target,
        {
          month: parsed.data.returnMonth ?? vancouverMonthKey(),
          classSectionId: parsed.data.classSectionId,
          workshopDefinitionId: parsed.data.returnWorkshopDefinitionId,
          week: parsed.data.returnWeek,
        },
        { tab: 'workshops' }
      )
    : target
  let id: string
  try {
    id = await scheduleTransaction(async (tx) => {
      const cls = await tx.classSection.findFirst({
        where: {
          id: parsed.data.classSectionId,
          archivedAt: null,
          school: { deletedAt: null },
        },
        include: {},
      })
      if (!cls) throw new SchedulingError('Select an active teacher.')
      const teacher = await tx.user.findFirst({
        where: {
          id: cls.teacherId,
          role: 'TEACHER',
          deletedAt: null,
          schoolId: cls.schoolId,
        },
        select: { id: true },
      })
      if (!teacher) throw new SchedulingError('Select an active teacher.')
      if (
        !(await tx.workshopDefinition.findUnique({
          where: { id: parsed.data.workshopDefinitionId },
        }))
      )
        throw new SchedulingError('Select a workshop.')
      const { classSectionId, workshopDefinitionId, notes } = parsed.data
      const data = { classSectionId, workshopDefinitionId, notes }
      return (await tx.classWorkshop.create({ data })).id
    })
  } catch (error) {
    fail(error, returnTarget)
  }
  refresh()
  redirect(parsed.data.returnToClass ? returnTarget : '/admin/class-workshops/' + id)
}

export async function identifyImportedWorkshop(form: FormData) {
  await requireRole('ADMIN')
  const parsed = identifyClassWorkshopSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) redirect('/admin/classes?error=Invalid+workshop+identity.')
  const input = parsed.data
  const target = '/admin/class-workshops/' + input.classWorkshopId
  try {
    await scheduleTransaction(async (tx) => {
      const record = await activeClassWorkshop(tx, input.classWorkshopId)
      if (record.updatedAt.toISOString() !== input.expectedUpdatedAt)
        throw new SchedulingError('This teacher workshop changed. Reload and try again.')
      const original = await tx.workshopDefinition.findUniqueOrThrow({
        where: { id: record.workshopDefinitionId },
      })
      const definition = await tx.workshopDefinition.findFirst({
        where: { id: input.workshopDefinitionId, identityStatus: 'IDENTIFIED' },
      })
      if (original.identityStatus !== 'NEEDS_IDENTIFICATION' || !definition)
        throw new SchedulingError('Choose a workshop for an unidentified imported session.')
      if (
        record.sessions.some(
          (s) => !withinDeliveryWindow(definition, s.scheduledStart, s.scheduledEnd)
        )
      )
        throw new SchedulingError('The booked session is outside this workshop’s delivery window.')
      await tx.classWorkshop.update({
        where: { id: record.id },
        data: { workshopDefinitionId: definition.id },
      })
      await tx.workshopSession.updateMany({
        where: { classWorkshopId: record.id },
        data: { version: { increment: 1 } },
      })
    })
  } catch (error) {
    fail(error, target)
  }
  refresh()
  redirect(target)
}

export async function saveAvailabilitySlot(form: FormData) {
  await requireRole('ADMIN')
  const parsed = availabilitySlotSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success)
    redirect('/admin/classes?error=' + encodeURIComponent(parsed.error.issues[0].message))
  const data = parsed.data
  const target = '/admin/class-workshops/' + data.classWorkshopId
  try {
    await scheduleTransaction(async (tx) => {
      const record = await activeClassWorkshop(tx, data.classWorkshopId)
      const start = vancouverToUtc(data.date, clockMinutes(data.startTime))
      const end = vancouverToUtc(data.date, clockMinutes(data.endTime))
      if (data.id) {
        const existing = await tx.availabilitySlot.findFirst({
          where: { id: data.id, classWorkshopId: record.id },
        })
        if (!existing || existing.updatedAt.toISOString() !== data.expectedUpdatedAt)
          throw new SchedulingError('This availability changed. Reload and try again.')
        // Preserve the evidence of a booked time. Other candidates remain editable.
        if (
          record.sessions.some(
            (s) => existing.start <= s.scheduledStart && existing.end >= s.scheduledEnd
          )
        )
          throw new SchedulingError(
            'This window supports a scheduled session. Reschedule or cancel the session before editing it.'
          )
        await tx.availabilitySlot.update({
          where: { id: existing.id },
          data: { start, end, notes: data.notes },
        })
      } else
        await tx.availabilitySlot.create({
          data: { classWorkshopId: record.id, start, end, notes: data.notes },
        })
    })
  } catch (error) {
    fail(error, target)
  }
  refresh()
  redirect(target)
}

export async function removeAvailabilitySlot(form: FormData) {
  await requireRole('ADMIN')
  const parsed = removeAvailabilitySchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) redirect('/admin/classes?error=Invalid+availability.')
  const target = '/admin/class-workshops/' + parsed.data.classWorkshopId
  try {
    await scheduleTransaction(async (tx) => {
      const record = await activeClassWorkshop(tx, parsed.data.classWorkshopId)
      const slot = await tx.availabilitySlot.findFirst({
        where: { id: parsed.data.id, classWorkshopId: record.id },
      })
      if (!slot || slot.updatedAt.toISOString() !== parsed.data.expectedUpdatedAt)
        throw new SchedulingError('This availability changed. Reload and try again.')
      if (record.sessions.some((s) => slot.start <= s.scheduledStart && slot.end >= s.scheduledEnd))
        throw new SchedulingError(
          'This window supports a scheduled session. Reschedule or cancel the session before removing it.'
        )
      await tx.availabilitySlot.delete({ where: { id: slot.id } })
    })
  } catch (error) {
    fail(error, target)
  }
  refresh()
  redirect(target)
}

export async function scheduleCandidate(form: FormData) {
  await requireRole('ADMIN')
  const parsed = scheduleCandidateSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) redirect('/admin/classes?error=Invalid+session+details.')
  const input = parsed.data
  const target = '/admin/class-workshops/' + input.classWorkshopId
  let id: string
  try {
    id = await scheduleTransaction(async (tx) => {
      const record = await activeClassWorkshop(tx, input.classWorkshopId, {
        requireCurrentTeacher: false,
      })
      const slot = await tx.availabilitySlot.findFirst({
        where: {
          id: input.slotId,
          OR: [{ classWorkshopId: record.id }, { classSectionId: record.classSectionId }],
        },
      })
      if (!slot || slot.updatedAt.toISOString() !== input.expectedUpdatedAt)
        throw new SchedulingError('This availability changed. Reload before scheduling.')
      const data = workshopSchema.safeParse({
        ...input,
        date: vancouverDateKey(slot.start),
        classSectionId: record.classSectionId,
        workshopDefinitionId: record.workshopDefinitionId,
        minPAs: record.workshopDefinition.defaultMinPAs,
        maxPAs: record.workshopDefinition.defaultMaxPAs,
      })
      if (!data.success) throw new SchedulingError(data.error.issues[0].message)
      const session = await validateSlot(tx, data.data)
      if (session.scheduledStart < slot.start || session.scheduledEnd > slot.end)
        throw new SchedulingError('Choose a time inside the selected availability window.')
      return (
        await tx.workshopSession.create({
          data: {
            ...session,
            mode: input.mode,
            location: input.location || null,
            notes: input.notes || null,
          },
        })
      ).id
    })
  } catch (error) {
    fail(error, target)
  }
  refresh()
  redirect('/admin/workshops/' + id + '?saved=1')
}
