'use server'

import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import {
  classAvailabilitySchema,
  removeClassAvailabilitySchema,
} from '@/lib/schemas/class-workshops'
import { clockMinutes } from '@/lib/schemas/workshops'
import { scheduleTransaction, SchedulingError } from '@/lib/scheduling/store'
import { vancouverToUtc } from '@/lib/time'
import {
  resolveClassAvailabilityWindowsForDate,
  type ResolvedClassAvailabilityWindow,
} from '@/lib/scheduling/recurring-candidates'
import {
  classOccurrenceSchema,
  recurringClassAvailabilitySchema,
  removeClassAvailabilityExceptionSchema,
  removeRecurringClassAvailabilitySchema,
  removeSchoolClosureSchema,
} from '@/lib/schemas/class-availability'

export type ClassAvailabilityState = { error?: string; saved?: boolean; sessionId?: string }

class BookedOccurrenceError extends SchedulingError {
  constructor(readonly sessionId: string) {
    super('This time overlaps a booked session. Manage that session first.')
  }
}

async function protectBookedTime(
  tx: Prisma.TransactionClient,
  classSectionId: string,
  date: string,
  windows: Pick<ResolvedClassAvailabilityWindow, 'startMinute' | 'endMinute'>[]
) {
  if (!windows.length) return
  const booking = await tx.workshopSession.findFirst({
    where: {
      classWorkshop: { classSectionId },
      status: { not: 'CANCELLED' },
      OR: windows.map((window) => ({
        scheduledStart: { lt: vancouverToUtc(date, window.endMinute) },
        scheduledEnd: { gt: vancouverToUtc(date, window.startMinute) },
      })),
    },
    select: { id: true },
  })
  if (booking) throw new BookedOccurrenceError(booking.id)
}

export type ClassOccurrenceState = ClassAvailabilityState & {
  skipId?: string
  updatedAt?: string
  removed?: boolean
}

export async function changeClassOccurrence(
  _state: ClassOccurrenceState,
  form: FormData
): Promise<ClassOccurrenceState> {
  await requireRole('ADMIN')
  const parsed = classOccurrenceSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { error: 'This weekly time changed. Reload and try again.' }
  const input = parsed.data
  try {
    const result = await scheduleTransaction(async (tx) => {
      const cls = await activeClass(tx, input.classSectionId)
      const meeting = await tx.classMeeting.findFirst({
        where: { id: input.id, classSectionId: cls.id },
        include: { skips: true },
      })
      if (!meeting) throw new SchedulingError('This weekly time changed. Reload and try again.')
      const recurring = [
        {
          ...meeting,
          active: meeting.activeForScheduling,
          effectiveFrom: meeting.effectiveFrom.toISOString().slice(0, 10),
          effectiveUntil: meeting.effectiveUntil?.toISOString().slice(0, 10),
        },
      ]
      if (!resolveClassAvailabilityWindowsForDate({ date: input.date, recurring }).length)
        throw new SchedulingError('This weekly time does not apply to the selected date.')
      const skip = meeting.skips.find((item) => item.date.toISOString().slice(0, 10) === input.date)
      // Retrying the same removal is harmless. After restoration the old revision
      // cannot create a new skip, and Undo must name the exact current skip.
      if (!input.skipId && skip?.sourceUpdatedAt.toISOString() === input.expectedUpdatedAt)
        return {
          saved: true,
          removed: true,
          skipId: skip.id,
          updatedAt: meeting.updatedAt.toISOString(),
        }
      if (
        meeting.updatedAt.toISOString() !== input.expectedUpdatedAt ||
        (input.skipId ? skip?.id !== input.skipId : !!skip)
      )
        throw new SchedulingError('This availability changed. Reload and try again.')
      const updatedAt = new Date(Math.max(Date.now(), meeting.updatedAt.getTime() + 1))
      let skipId = ''
      if (input.skipId) {
        await tx.classMeetingSkip.delete({ where: { id: input.skipId } })
      } else {
        const exceptions = await tx.classAvailabilityException.findMany({
          where: { classSectionId: cls.id, date: new Date(input.date) },
        })
        const closures = await tx.schoolClosure.findMany({
          where: { schoolId: cls.schoolId, date: new Date(input.date) },
        })
        const windows = resolveClassAvailabilityWindowsForDate({
          date: input.date,
          recurring,
          exceptions: [
            ...exceptions.map((item) => ({ ...item, date: input.date })),
            ...closures.map((item) => ({ ...item, date: input.date, kind: 'CLOSED' as const })),
          ],
        }).filter((window) => window.authorization.kind === 'RECURRING')
        await protectBookedTime(tx, cls.id, input.date, windows)
        const created = await tx.classMeetingSkip.create({
          data: {
            classMeetingId: meeting.id,
            date: new Date(input.date),
            sourceUpdatedAt: meeting.updatedAt,
          },
        })
        skipId = created.id
      }
      await tx.classMeeting.update({ where: { id: meeting.id }, data: { updatedAt } })
      return { saved: true, removed: !input.skipId, skipId, updatedAt: updatedAt.toISOString() }
    })
    revalidatePath('/admin', 'layout')
    return result
  } catch (error) {
    return failure(error)
  }
}

async function activeClass(tx: Prisma.TransactionClient, id: string) {
  const cls = await tx.classSection.findFirst({
    where: {
      id,
      archivedAt: null,
      school: { deletedAt: null },
    },
    include: {},
  })
  if (!cls) throw new SchedulingError('Select an active teacher.')
  const teacher = await tx.user.findFirst({
    where: {
      id: cls.teacherId,
      deletedAt: null,
      role: 'TEACHER',
      schoolId: cls.schoolId,
    },
    select: { id: true },
  })
  if (!teacher) throw new SchedulingError('Select an active teacher.')
  return cls
}

async function editableSlot(
  tx: Prisma.TransactionClient,
  input: { classSectionId: string; id: string; expectedUpdatedAt: string }
) {
  const slot = await tx.availabilitySlot.findFirst({
    where: { id: input.id, classSectionId: input.classSectionId },
  })
  if (!slot || slot.updatedAt.toISOString() !== input.expectedUpdatedAt)
    throw new SchedulingError('This availability changed. Reload and try again.')
  const booking = await tx.workshopSession.findFirst({
    where: {
      classWorkshop: { classSectionId: input.classSectionId },
      status: { not: 'CANCELLED' },
      scheduledStart: { gte: slot.start },
      scheduledEnd: { lte: slot.end },
    },
  })
  if (booking)
    throw new SchedulingError(
      'This availability supports a booked session. Reschedule or cancel that session first.'
    )
  return slot
}

function failure(error: unknown): ClassAvailabilityState {
  if (error instanceof BookedOccurrenceError)
    return { error: error.message, sessionId: error.sessionId }
  if (error instanceof SchedulingError) return { error: error.message }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ['P2002', 'P2034'].includes(error.code)
  )
    return { error: 'That time already exists or changed. Reload and try again.' }
  throw error
}

export async function saveClassAvailability(
  _state: ClassAvailabilityState,
  form: FormData
): Promise<ClassAvailabilityState> {
  await requireRole('ADMIN')
  const parsed = classAvailabilitySchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const input = parsed.data
  try {
    await scheduleTransaction(async (tx) => {
      await activeClass(tx, input.classSectionId)
      const start = vancouverToUtc(input.date, clockMinutes(input.startTime))
      const end = vancouverToUtc(input.date, clockMinutes(input.endTime))
      if (input.id) await editableSlot(tx, input)
      const overlap = await tx.availabilitySlot.findFirst({
        where: {
          classSectionId: input.classSectionId,
          ...(input.id ? { id: { not: input.id } } : {}),
          start: { lt: end },
          end: { gt: start },
        },
      })
      if (overlap)
        throw new SchedulingError(
          'This overlaps an existing teacher availability window. Edit that window instead.'
        )
      const data = { start, end, notes: input.notes }
      if (input.id) await tx.availabilitySlot.update({ where: { id: input.id }, data })
      else
        await tx.availabilitySlot.create({
          data: { ...data, classSectionId: input.classSectionId },
        })
    })
  } catch (error) {
    return failure(error)
  }
  revalidatePath('/admin', 'layout')
  return { saved: true }
}

export async function removeClassAvailability(
  _state: ClassAvailabilityState,
  form: FormData
): Promise<ClassAvailabilityState> {
  await requireRole('ADMIN')
  const parsed = removeClassAvailabilitySchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { error: 'Invalid availability. Reload and try again.' }
  try {
    await scheduleTransaction(async (tx) => {
      await activeClass(tx, parsed.data.classSectionId)
      const slot = await editableSlot(tx, parsed.data)
      await tx.availabilitySlot.delete({ where: { id: slot.id } })
    })
  } catch (error) {
    return failure(error)
  }
  revalidatePath('/admin', 'layout')
  return { saved: true }
}

export async function saveRecurringClassAvailability(
  _state: ClassAvailabilityState,
  form: FormData
): Promise<ClassAvailabilityState> {
  await requireRole('ADMIN')
  const parsed = recurringClassAvailabilitySchema.safeParse({
    ...Object.fromEntries(form),
    days: form.getAll('days'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const input = parsed.data
  try {
    await scheduleTransaction(async (tx) => {
      await activeClass(tx, input.classSectionId)
      const data = {
        dayOfWeek: input.days[0],
        startMinute: input.startMinute,
        endMinute: input.endMinute,
        effectiveFrom: new Date(`${input.effectiveFrom}T00:00:00.000Z`),
        effectiveUntil: input.effectiveUntil
          ? new Date(`${input.effectiveUntil}T00:00:00.000Z`)
          : null,
        activeForScheduling: input.activeForScheduling,
        notes: input.notes || null,
      }
      if (input.id) {
        const row = await tx.classMeeting.findFirst({
          where: { id: input.id, classSectionId: input.classSectionId },
        })
        if (!row || row.updatedAt.toISOString() !== input.expectedUpdatedAt)
          throw new SchedulingError('This weekly time changed. Reload and try again.')
        await tx.classMeeting.update({ where: { id: row.id }, data })
      } else {
        const days = [...new Set(input.days)]
        await tx.classMeeting.createMany({
          data: days.map((dayOfWeek) => ({
            ...data,
            dayOfWeek,
            classSectionId: input.classSectionId,
          })),
        })
      }
    })
  } catch (error) {
    return failure(error)
  }
  revalidatePath('/admin', 'layout')
  return { saved: true }
}

export async function removeRecurringClassAvailability(
  _state: ClassAvailabilityState,
  form: FormData
): Promise<ClassAvailabilityState> {
  await requireRole('ADMIN')
  const parsed = removeRecurringClassAvailabilitySchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { error: 'This weekly time changed. Reload and try again.' }
  try {
    await scheduleTransaction(async (tx) => {
      await activeClass(tx, parsed.data.classSectionId)
      const removed = await tx.classMeeting.deleteMany({
        where: {
          id: parsed.data.id,
          classSectionId: parsed.data.classSectionId,
          updatedAt: new Date(parsed.data.expectedUpdatedAt),
        },
      })
      if (!removed.count)
        throw new SchedulingError('This weekly time changed. Reload and try again.')
    })
  } catch (error) {
    return failure(error)
  }
  revalidatePath('/admin', 'layout')
  return { saved: true }
}

export async function removeClassAvailabilityException(
  _state: ClassAvailabilityState,
  form: FormData
): Promise<ClassAvailabilityState> {
  await requireRole('ADMIN')
  const parsed = removeClassAvailabilityExceptionSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { error: 'This exception changed. Reload and try again.' }
  try {
    await scheduleTransaction(async (tx) => {
      await activeClass(tx, parsed.data.classSectionId)
      const exception = await tx.classAvailabilityException.findFirst({
        where: {
          id: parsed.data.id,
          classSectionId: parsed.data.classSectionId,
          updatedAt: new Date(parsed.data.expectedUpdatedAt),
        },
      })
      if (!exception) throw new SchedulingError('This exception changed. Reload and try again.')
      if (
        exception.kind === 'ADDITIONAL' &&
        exception.startMinute != null &&
        exception.endMinute != null
      )
        await protectBookedTime(
          tx,
          parsed.data.classSectionId,
          exception.date.toISOString().slice(0, 10),
          [{ startMinute: exception.startMinute, endMinute: exception.endMinute }]
        )
      const removed = await tx.classAvailabilityException.deleteMany({
        where: { id: parsed.data.id, classSectionId: parsed.data.classSectionId },
      })
      if (!removed.count) throw new SchedulingError('This exception changed. Reload and try again.')
    })
  } catch (error) {
    return failure(error)
  }
  revalidatePath('/admin', 'layout')
  return { saved: true }
}

export async function removeSchoolClosure(
  _state: ClassAvailabilityState,
  form: FormData
): Promise<ClassAvailabilityState> {
  await requireRole('ADMIN')
  const parsed = removeSchoolClosureSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { error: 'This closure changed. Reload and try again.' }
  try {
    await scheduleTransaction(async (tx) => {
      const school = await tx.school.findFirst({
        where: { id: parsed.data.schoolId, deletedAt: null },
      })
      if (!school) throw new SchedulingError('Select an active school.')
      const removed = await tx.schoolClosure.deleteMany({
        where: {
          id: parsed.data.id,
          schoolId: parsed.data.schoolId,
          updatedAt: new Date(parsed.data.expectedUpdatedAt),
        },
      })
      if (!removed.count) throw new SchedulingError('This closure changed. Reload and try again.')
    })
  } catch (error) {
    return failure(error)
  }
  revalidatePath('/admin', 'layout')
  return { saved: true }
}
