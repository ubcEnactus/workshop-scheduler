'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { gapSchema, quotaSchema, staffSchema, lockSchema } from '@/lib/schemas/staffing'
import { workshopVersionSchema } from '@/lib/schemas/workshops'
import { scheduleTransaction, loadSchedule, SchedulingError } from '@/lib/scheduling/store'
import { eligibility, staffingProblems } from '@/lib/scheduling/eligibility'
import { auditState } from '@/lib/scheduling/changes'

function fail(error: unknown, target: string): never {
  if (error instanceof SchedulingError)
    redirect(
      target + (target.includes('?') ? '&' : '?') + 'error=' + encodeURIComponent(error.message)
    )
  throw error
}
function refresh(id?: string) {
  revalidatePath('/admin/workshops')
  revalidatePath('/admin/staffing')
  if (id) revalidatePath('/admin/workshops/' + id)
  revalidatePath('/pa')
  revalidatePath('/teacher')
}
export async function saveQuota(formData: FormData) {
  await requireRole('ADMIN')
  const parsed = quotaSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    redirect('/admin/staffing?error=' + encodeURIComponent(parsed.error.issues[0].message))
  try {
    await scheduleTransaction(async (tx) => {
      if (
        !(await tx.user.findFirst({ where: { id: parsed.data.paId, role: 'PA', deletedAt: null } }))
      )
        throw new SchedulingError('Select an active PA.')
      await tx.monthlyPAQuota.upsert({
        where: { paId_month: { paId: parsed.data.paId, month: parsed.data.month } },
        create: parsed.data,
        update: { quota: parsed.data.quota },
      })
    })
  } catch (error) {
    fail(error, '/admin/staffing?month=' + parsed.data.month)
  }
  refresh()
  redirect('/admin/staffing?month=' + parsed.data.month + '&saved=1')
}
export async function saveGap(formData: FormData) {
  await requireRole('ADMIN')
  const parsed = gapSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    redirect('/admin/staffing?error=' + encodeURIComponent(parsed.error.issues[0].message))
  await scheduleTransaction((tx) =>
    tx.schedulingSettings.update({ where: { id: 1 }, data: parsed.data })
  )
  refresh()
  redirect('/admin/staffing?saved=1')
}
export async function assignPA(formData: FormData) {
  await requireRole('ADMIN')
  const parsed = staffSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/admin/workshops?error=Invalid+staffing+request.')
  const { id, version, paId } = parsed.data
  try {
    await scheduleTransaction(async (tx) => {
      const snapshot = await loadSchedule(tx)
      const workshop = snapshot.workshops.find((w) => w.id === id)
      if (!workshop || workshop.status !== 'DRAFT')
        throw new SchedulingError('Select a draft workshop.')
      if (workshop.version !== version)
        throw new SchedulingError('This workshop changed. Reload and try again.')
      if (workshop.assignments.some((a) => a.paId === paId))
        throw new SchedulingError('This PA is already assigned.')
      const reasons = eligibility(snapshot, workshop, paId)
      if (reasons.length) throw new SchedulingError(reasons.join(' '))
      await tx.assignment.create({
        data: { workshopId: id, paId, status: 'DRAFT', source: 'MANUAL' },
      })
      await tx.workshop.update({ where: { id }, data: { locked: true, version: { increment: 1 } } })
    })
  } catch (error) {
    fail(error, '/admin/workshops/' + id)
  }
  refresh(id)
  redirect('/admin/workshops/' + id + '?staffed=1')
}
export async function removePA(formData: FormData) {
  await requireRole('ADMIN')
  const parsed = staffSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/admin/workshops?error=Invalid+staffing+request.')
  const { id, version, paId } = parsed.data
  try {
    await scheduleTransaction(async (tx) => {
      const workshop = await tx.workshop.findUnique({ where: { id } })
      if (!workshop || workshop.status !== 'DRAFT')
        throw new SchedulingError('Only draft staffing can be removed here.')
      if (workshop.version !== version)
        throw new SchedulingError('This workshop changed. Reload and try again.')
      await tx.assignment.deleteMany({ where: { workshopId: id, paId } })
      await tx.workshop.update({ where: { id }, data: { locked: true, version: { increment: 1 } } })
    })
  } catch (error) {
    fail(error, '/admin/workshops/' + id)
  }
  refresh(id)
  redirect('/admin/workshops/' + id + '?staffed=1')
}
export async function setWorkshopLock(formData: FormData) {
  await requireRole('ADMIN')
  const parsed = lockSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/admin/workshops?error=Invalid+lock+request.')
  const { id, version, locked } = parsed.data
  try {
    await scheduleTransaction(async (tx) => {
      const workshop = await tx.workshop.findUnique({ where: { id } })
      if (!workshop || workshop.status !== 'DRAFT')
        throw new SchedulingError('Published and historical workshops are always protected.')
      if (workshop.version !== version)
        throw new SchedulingError('This workshop changed. Reload and try again.')
      await tx.workshop.update({ where: { id }, data: { locked, version: { increment: 1 } } })
    })
  } catch (error) {
    fail(error, '/admin/workshops/' + id)
  }
  refresh(id)
  redirect('/admin/workshops/' + id)
}
export async function publishWorkshop(formData: FormData) {
  const actor = await requireRole('ADMIN')
  const parsed = workshopVersionSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/admin/workshops?error=Invalid+publication+request.')
  const { id, version } = parsed.data
  try {
    await scheduleTransaction(async (tx) => {
      const snapshot = await loadSchedule(tx)
      const workshop = snapshot.workshops.find((w) => w.id === id)
      if (!workshop || workshop.status !== 'DRAFT')
        throw new SchedulingError('Only drafts can be published.')
      if (workshop.version !== version)
        throw new SchedulingError('This workshop changed. Reload and try again.')
      const reasons = staffingProblems(snapshot, workshop)
      if (reasons.length) throw new SchedulingError(reasons.join(' '))
      await tx.assignment.updateMany({ where: { workshopId: id }, data: { status: 'PUBLISHED' } })
      await tx.workshop.update({
        where: { id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          locked: true,
          version: { increment: 1 },
        },
      })
      await tx.workshopEvent.create({
        data: {
          workshopId: id,
          actorId: actor.id,
          actorName: actor.name ?? actor.email,
          kind: 'PUBLISH',
          reason: 'Workshop published.',
          before: auditState(workshop, snapshot),
          after: auditState({ ...workshop, status: 'PUBLISHED' }, snapshot),
          wasPublished: true,
          affectedPAIds: workshop.assignments.map((a) => a.paId),
        },
      })
    })
  } catch (error) {
    fail(error, '/admin/workshops/' + id)
  }
  refresh(id)
  redirect('/admin/workshops/' + id + '?published=1')
}
