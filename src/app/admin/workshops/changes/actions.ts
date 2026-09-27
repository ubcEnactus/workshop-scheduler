'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { changeRequestSchema, applyChangeSchema } from '@/lib/schemas/changes'
import { loadSchedule, scheduleTransaction, SchedulingError } from '@/lib/scheduling/store'
import { auditState, proposeChange, changeScheduleScope } from '@/lib/scheduling/changes'
import { readSchedulingContext, schedulingHref } from '@/lib/scheduling/navigation'
import { scheduleHash } from '@/lib/scheduling/matching-preview'
import { needsCommunication } from '@/lib/scheduling/communication'

function fail(error: unknown, path: string): never {
  if (error instanceof SchedulingError)
    redirect(path + (path.includes('?') ? '&' : '?') + 'error=' + encodeURIComponent(error.message))
  throw error
}
export async function stageWorkshopChange(formData: FormData) {
  const actor = await requireRole('ADMIN')
  const hasContext = formData.has('month')
  const context = readSchedulingContext(formData)
  const parsed = changeRequestSchema.safeParse({
    ...Object.fromEntries(formData),
    ...(formData.get('kind') === 'EDIT' ? { paIds: formData.getAll('paIds') } : {}),
  })
  if (!parsed.success)
    redirect(
      hasContext
        ? schedulingHref('/admin/workshops', context, {
            error: parsed.error.issues[0].message,
          })
        : '/admin/workshops?error=' + encodeURIComponent(parsed.error.issues[0].message)
    )
  let id: string
  try {
    id = await scheduleTransaction(async (tx) => {
      if (
        parsed.data.inputHash &&
        parsed.data.inputHash !==
          scheduleHash(
            await loadSchedule(tx, { kind: 'sessions', workshopSessionIds: [parsed.data.id] })
          )
      )
        throw new SchedulingError(
          'The schedule changed. Reload this session before reviewing an edit.'
        )
      const snapshot = await loadSchedule(tx, changeScheduleScope(parsed.data))
      const inputHash = scheduleHash(snapshot)
      const { current, next } = await proposeChange(tx, snapshot, parsed.data, {
        actorId: actor.id,
        preview: true,
      })
      const change = await tx.workshopChange.create({
        data: {
          workshopSessionId: current.id,
          actorId: actor.id,
          payload: { ...parsed.data, inputHash },
          before: auditState(current, snapshot),
          proposed: auditState(next, snapshot),
        },
      })
      return change.id
    })
  } catch (error) {
    fail(
      error,
      hasContext
        ? schedulingHref('/admin/workshops/' + parsed.data.id, context)
        : '/admin/workshops/' + parsed.data.id
    )
  }
  redirect(
    hasContext
      ? schedulingHref('/admin/workshops/changes/' + id, context)
      : '/admin/workshops/changes/' + id
  )
}
export async function applyWorkshopChange(formData: FormData) {
  const actor = await requireRole('ADMIN')
  const hasContext = formData.has('month')
  const context = readSchedulingContext(formData)
  const parsed = applyChangeSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    redirect(
      hasContext
        ? schedulingHref('/admin/workshops', context, { error: 'Invalid change.' })
        : '/admin/workshops?error=Invalid+change.'
    )
  let workshopSessionId: string
  try {
    workshopSessionId = await scheduleTransaction(async (tx) => {
      const change = await tx.workshopChange.findUnique({ where: { id: parsed.data.id } })
      if (!change || change.actorId !== actor.id)
        throw new SchedulingError('Change is unavailable.')
      if (change.appliedAt) return change.workshopSessionId
      const data = changeRequestSchema.parse({
        ...changeRequestSchema.parse(change.payload),
        ...parsed.data,
        id: change.workshopSessionId,
      })
      const snapshot = await loadSchedule(tx, changeScheduleScope(data))
      if (data.inputHash && data.inputHash !== scheduleHash(snapshot))
        throw new SchedulingError(
          'Availability or commitments changed after this review. Return to the session and review a new change.'
        )
      const { current, next, slotData } = await proposeChange(tx, snapshot, data, {
        actorId: actor.id,
      })
      if (data.kind === 'REPLACE' || data.kind === 'EDIT' || data.kind === 'RESCHEDULE') {
        if (current.status === 'DRAFT') {
          for (const removed of current.assignments.filter(
            (item) => !next.assignments.some((pa) => pa.paId === item.paId)
          )) {
            await tx.autoFillExclusion.upsert({
              where: {
                workshopSessionId_paId: { workshopSessionId: current.id, paId: removed.paId },
              },
              update: {},
              create: { workshopSessionId: current.id, paId: removed.paId },
            })
          }
          await tx.autoFillExclusion.deleteMany({
            where: {
              workshopSessionId: current.id,
              paId: { in: next.assignments.map((item) => item.paId) },
            },
          })
        }
        await tx.assignment.deleteMany({
          where: {
            workshopSessionId: current.id,
            paId: { notIn: next.assignments.map((a) => a.paId) },
          },
        })
        for (const assignment of next.assignments) {
          const fields = {
            status: assignment.status,
            source: assignment.source,
            overrideAvailability: assignment.overrideAvailability ?? false,
            overrideSameDay: assignment.overrideSameDay ?? false,
            overrideWeek: assignment.overrideWeek ?? false,
            overrideReason: assignment.overrideReason ?? null,
          }
          await tx.assignment.upsert({
            where: {
              workshopSessionId_paId: { workshopSessionId: current.id, paId: assignment.paId },
            },
            create: { workshopSessionId: current.id, paId: assignment.paId, ...fields },
            update: fields,
          })
        }
      }
      const saved = await tx.workshopSession.update({
        where: { id: current.id },
        data: {
          ...slotData,
          status: next.status,
          scheduledStart: next.scheduledStart,
          scheduledEnd: next.scheduledEnd,
          minPAs: next.minPAs,
          maxPAs: next.maxPAs,
          ...(data.kind === 'EDIT'
            ? {
                mode: data.mode,
                location: data.location || null,
                notes: data.notes || null,
                participantInstructions: data.participantInstructions || null,
              }
            : {}),
          locked: next.locked,
          version: { increment: 1 },
          ...(current.status === 'PUBLISHED'
            ? {
                publishedAt:
                  (await tx.workshopSession.findUniqueOrThrow({ where: { id: current.id } }))
                    .publishedAt ?? new Date(),
              }
            : {}),
        },
      })
      await tx.classWorkshop.update({
        where: { id: saved.classWorkshopId },
        data: {
          status:
            data.kind === 'COMPLETE'
              ? 'COMPLETED'
              : data.kind === 'CANCEL'
                ? 'NEEDS_AVAILABILITY'
                : 'SCHEDULED',
          revision: { increment: 1 },
        },
      })
      await tx.workshopEvent.create({
        data: {
          workshopSessionId: current.id,
          actorId: actor.id,
          actorName: actor.name ?? actor.email,
          kind:
            data.kind === 'EDIT' &&
            !needsCommunication({
              kind: data.kind,
              wasPublished: true,
              before: auditState(current, snapshot),
              after: auditState(next, snapshot),
            })
              ? 'INTERNAL_EDIT'
              : data.kind,
          reason: data.reason,
          before: auditState(current, snapshot),
          after: auditState(next, snapshot),
          wasPublished: saved.publishedAt !== null,
          affectedPAIds: [
            ...new Set([...current.assignments, ...next.assignments].map((a) => a.paId)),
          ],
        },
      })
      await tx.workshopChange.update({ where: { id: change.id }, data: { appliedAt: new Date() } })
      return current.id
    })
  } catch (error) {
    fail(
      error,
      hasContext
        ? schedulingHref('/admin/workshops/changes/' + parsed.data.id, context)
        : '/admin/workshops/changes/' + parsed.data.id
    )
  }
  revalidatePath('/admin/workshops', 'layout')
  revalidatePath('/admin/workshop-definitions', 'layout')
  revalidatePath('/admin/staffing')
  revalidatePath('/pa')
  revalidatePath('/teacher')
  redirect(
    hasContext
      ? schedulingHref('/admin/workshops/' + workshopSessionId, context, { changed: '1' })
      : '/admin/workshops/' + workshopSessionId + '?changed=1'
  )
}
