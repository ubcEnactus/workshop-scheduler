'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { gapSchema, quotaSchema, staffSchema, lockSchema } from '@/lib/schemas/staffing'
import { workshopVersionSchema } from '@/lib/schemas/workshops'
import { scheduleTransaction, SchedulingError } from '@/lib/scheduling/store'
import { changeDraftStaffing, publishDrafts } from '@/lib/scheduling/draft-mutations'
import { readSchedulingContext, schedulingHref } from '@/lib/scheduling/navigation'

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
    tx.schedulingSettings.update({
      where: { id: 1 },
      data: { minimumGapDays: parsed.data.minimumGapDays },
    })
  )
  refresh()
  redirect(
    parsed.data.month
      ? schedulingHref('/admin/staffing', readSchedulingContext(formData), { saved: '1' })
      : '/admin/staffing?saved=1'
  )
}
export async function assignPA(formData: FormData) {
  await requireRole('ADMIN')
  const parsed = staffSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/admin/workshops?error=Invalid+staffing+request.')
  const { id } = parsed.data
  try {
    await scheduleTransaction((tx) => changeDraftStaffing(tx, parsed.data, 'assign'))
  } catch (error) {
    fail(
      error,
      formData.has('month')
        ? schedulingHref('/admin/workshops/' + id, readSchedulingContext(formData))
        : '/admin/workshops/' + id
    )
  }
  refresh(id)
  redirect(
    formData.has('month')
      ? schedulingHref('/admin/workshops/' + id, readSchedulingContext(formData), { staffed: '1' })
      : '/admin/workshops/' + id + '?staffed=1'
  )
}
export async function removePA(formData: FormData) {
  await requireRole('ADMIN')
  const parsed = staffSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/admin/workshops?error=Invalid+staffing+request.')
  const { id } = parsed.data
  try {
    await scheduleTransaction((tx) => changeDraftStaffing(tx, parsed.data, 'remove'))
  } catch (error) {
    fail(
      error,
      formData.has('month')
        ? schedulingHref('/admin/workshops/' + id, readSchedulingContext(formData))
        : '/admin/workshops/' + id
    )
  }
  refresh(id)
  redirect(
    formData.has('month')
      ? schedulingHref('/admin/workshops/' + id, readSchedulingContext(formData), { staffed: '1' })
      : '/admin/workshops/' + id + '?staffed=1'
  )
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
    fail(
      error,
      formData.has('month')
        ? schedulingHref('/admin/workshops/' + id, readSchedulingContext(formData))
        : '/admin/workshops/' + id
    )
  }
  refresh(id)
  redirect(
    formData.has('month')
      ? schedulingHref('/admin/workshops/' + id, readSchedulingContext(formData))
      : '/admin/workshops/' + id
  )
}
export async function publishWorkshop(formData: FormData) {
  const actor = await requireRole('ADMIN')
  const parsed = workshopVersionSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/admin/workshops?error=Invalid+publication+request.')
  const { id } = parsed.data
  try {
    await scheduleTransaction((tx) => publishDrafts(tx, actor, [parsed.data]))
  } catch (error) {
    fail(
      error,
      formData.has('month')
        ? schedulingHref('/admin/workshops/' + id, readSchedulingContext(formData))
        : '/admin/workshops/' + id
    )
  }
  refresh(id)
  redirect(
    formData.has('month')
      ? schedulingHref('/admin/workshops/' + id, readSchedulingContext(formData), {
          published: '1',
        })
      : '/admin/workshops/' + id + '?published=1'
  )
}
