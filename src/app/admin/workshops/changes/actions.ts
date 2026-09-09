'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { changeRequestSchema } from '@/lib/schemas/changes'
import { previewIdSchema } from '@/lib/schemas/matching'
import { loadSchedule, scheduleTransaction, SchedulingError } from '@/lib/scheduling/store'
import { auditState, proposeChange } from '@/lib/scheduling/changes'

function fail(error: unknown, path: string): never {
  if (error instanceof SchedulingError)
    redirect(path + '?error=' + encodeURIComponent(error.message))
  throw error
}
export async function stageWorkshopChange(formData: FormData) {
  const actor = await requireRole('ADMIN')
  const parsed = changeRequestSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    redirect('/admin/workshops?error=' + encodeURIComponent(parsed.error.issues[0].message))
  let id: string
  try {
    id = await scheduleTransaction(async (tx) => {
      const snapshot = await loadSchedule(tx)
      const { current, next } = await proposeChange(tx, snapshot, parsed.data)
      const change = await tx.workshopChange.create({
        data: {
          workshopId: current.id,
          actorId: actor.id,
          payload: parsed.data,
          before: auditState(current, snapshot),
          proposed: auditState(next, snapshot),
        },
      })
      return change.id
    })
  } catch (error) {
    fail(error, '/admin/workshops/' + parsed.data.id)
  }
  redirect('/admin/workshops/changes/' + id)
}
export async function applyWorkshopChange(formData: FormData) {
  const actor = await requireRole('ADMIN')
  const parsed = previewIdSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/admin/workshops?error=Invalid+change.')
  let workshopId: string
  try {
    workshopId = await scheduleTransaction(async (tx) => {
      const change = await tx.workshopChange.findUnique({ where: { id: parsed.data.id } })
      if (!change || change.actorId !== actor.id)
        throw new SchedulingError('Change is unavailable.')
      if (change.appliedAt) return change.workshopId
      const data = changeRequestSchema.parse(change.payload)
      const snapshot = await loadSchedule(tx)
      const { current, next } = await proposeChange(tx, snapshot, data)
      if (data.kind === 'REPLACE') {
        await tx.assignment.delete({
          where: { workshopId_paId: { workshopId: current.id, paId: data.oldPaId } },
        })
        await tx.assignment.create({
          data: {
            workshopId: current.id,
            paId: data.newPaId,
            status: next.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
            source: 'MANUAL',
          },
        })
      }
      const saved = await tx.workshop.update({
        where: { id: current.id },
        data: {
          status: next.status,
          scheduledStart: next.scheduledStart,
          scheduledEnd: next.scheduledEnd,
          locked: true,
          version: { increment: 1 },
          ...(current.status === 'PUBLISHED'
            ? {
                publishedAt:
                  (await tx.workshop.findUniqueOrThrow({ where: { id: current.id } }))
                    .publishedAt ?? new Date(),
              }
            : {}),
        },
      })
      await tx.workshopEvent.create({
        data: {
          workshopId: current.id,
          actorId: actor.id,
          actorName: actor.name ?? actor.email,
          kind: data.kind,
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
    fail(error, '/admin/workshops/changes/' + parsed.data.id)
  }
  revalidatePath('/admin/workshops', 'layout')
  revalidatePath('/admin/staffing')
  revalidatePath('/pa')
  revalidatePath('/teacher')
  redirect('/admin/workshops/' + workshopId + '?changed=1')
}
