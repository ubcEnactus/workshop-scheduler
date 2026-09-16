'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { matchingScopeSchema, previewIdSchema } from '@/lib/schemas/matching'
import { scheduleTransaction, loadSchedule, SchedulingError } from '@/lib/scheduling/store'
import { eligibility } from '@/lib/scheduling/eligibility'
import { matchWorkshops } from '@/lib/scheduling/matcher'
import { scheduleHash } from '@/lib/scheduling/matching-preview'
import { vancouverMonthKey } from '@/lib/time'
import { readSchedulingContext, schedulingHref } from '@/lib/scheduling/navigation'

function fail(error: unknown, path: string): never {
  if (error instanceof SchedulingError)
    redirect(path + (path.includes('?') ? '&' : '?') + 'error=' + encodeURIComponent(error.message))
  throw error
}
export async function previewMatching(formData: FormData) {
  const actor = await requireRole('ADMIN')
  const context = readSchedulingContext(formData)
  const selection = new URLSearchParams()
  for (const id of formData.getAll('classId'))
    if (typeof id === 'string' && id.length <= 200) selection.append('classId', id)
  const retry =
    schedulingHref('/admin/workshops/match', context, { selection: '1' }) +
    '&' +
    selection.toString()
  const parsed = matchingScopeSchema.safeParse({
    month: formData.get('month'),
    classIds: formData.getAll('classId'),
  })
  if (!parsed.success)
    redirect(retry + '&error=' + encodeURIComponent(parsed.error.issues[0].message))
  let id: string
  try {
    id = await scheduleTransaction(async (tx) => {
      const snapshot = await loadSchedule(tx)
      const targets = snapshot.workshops.filter(
        (w) =>
          parsed.data.classIds.includes(w.classSectionId) &&
          vancouverMonthKey(w.scheduledStart) === parsed.data.month
      )
      if (!targets.length)
        throw new SchedulingError(
          'No dated workshops for these classes in this month. Plan slots first.'
        )
      const preview = await tx.matchingPreview.create({
        data: {
          actorId: actor.id,
          ...parsed.data,
          inputHash: scheduleHash(snapshot),
          plan: matchWorkshops(
            snapshot,
            targets.map((w) => w.id)
          ),
          expiresAt: new Date(Date.now() + 15 * 60_000),
        },
      })
      return preview.id
    })
  } catch (error) {
    fail(error, retry)
  }
  redirect(schedulingHref('/admin/workshops/match/' + id, context))
}
export async function applyMatching(formData: FormData) {
  const actor = await requireRole('ADMIN')
  const parsed = previewIdSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/admin/workshops/match?error=Invalid+preview.')
  const id = parsed.data.id
  let month: string
  try {
    month = await scheduleTransaction(async (tx) => {
      const preview = await tx.matchingPreview.findUnique({ where: { id } })
      if (!preview || preview.actorId !== actor.id)
        throw new SchedulingError('Preview is unavailable.')
      if (preview.appliedAt) return preview.month
      if (preview.expiresAt.getTime() <= Date.now())
        throw new SchedulingError('Preview expired. Generate a new preview.')
      const snapshot = await loadSchedule(tx)
      if (scheduleHash(snapshot) !== preview.inputHash)
        throw new SchedulingError('Schedule or eligibility changed. Generate a new preview.')
      const scope = matchingScopeSchema.parse({ month: preview.month, classIds: preview.classIds })
      const targets = snapshot.workshops.filter(
        (w) =>
          scope.classIds.includes(w.classSectionId) &&
          vancouverMonthKey(w.scheduledStart) === scope.month
      )
      const proposals = matchWorkshops(
        snapshot,
        targets.map((w) => w.id)
      )
      const final = {
        ...snapshot,
        workshops: snapshot.workshops.map((w) => {
          const proposal = proposals.find((p) => p.workshopId === w.id && !p.protected)
          return proposal
            ? {
                ...w,
                assignments: proposal.paIds.map((paId) => ({
                  paId,
                  status: 'DRAFT' as const,
                  source: 'AUTOMATIC' as const,
                })),
              }
            : w
        }),
      }
      for (const p of proposals.filter((p) => !p.protected)) {
        const w = final.workshops.find((w) => w.id === p.workshopId)!
        for (const paId of p.paIds) {
          const reasons = eligibility(final, w, paId)
          if (reasons.length) throw new SchedulingError(reasons.join(' '))
        }
        const before = snapshot.workshops.find((w) => w.id === p.workshopId)!
        if (
          JSON.stringify(before.assignments.map((a) => a.paId).sort()) === JSON.stringify(p.paIds)
        )
          continue
        await tx.assignment.deleteMany({
          where: { workshopId: w.id, status: 'DRAFT', source: 'AUTOMATIC' },
        })
        await tx.assignment.createMany({
          data: p.paIds.map((paId) => ({
            workshopId: w.id,
            paId,
            status: 'DRAFT',
            source: 'AUTOMATIC',
          })),
        })
        await tx.workshop.update({ where: { id: w.id }, data: { version: { increment: 1 } } })
      }
      await tx.matchingPreview.update({ where: { id }, data: { appliedAt: new Date() } })
      return preview.month
    })
  } catch (error) {
    fail(error, schedulingHref('/admin/workshops/match/' + id, readSchedulingContext(formData)))
  }
  revalidatePath('/admin/workshops', 'layout')
  revalidatePath('/admin/staffing')
  redirect(
    schedulingHref(
      '/admin/workshops',
      { ...readSchedulingContext(formData), month },
      { matched: '1' }
    )
  )
}
