'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { blockedDateSchema, blockedDateIdSchema } from '@/lib/schemas/blocked-dates'

export async function addBlockedDate(formData: FormData) {
  await requireRole('ADMIN')

  const parsed = blockedDateSchema.safeParse({
    schoolId: formData.get('schoolId') || undefined,
    date: formData.get('date'),
    reason: formData.get('reason') || undefined,
  })

  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(', ')
    return { ok: false, error: msg }
  }

  const dateUtc = new Date(parsed.data.date.toISOString().slice(0, 10) + 'T00:00:00.000Z')

  await prisma.blockedDate.create({
    data: {
      schoolId: parsed.data.schoolId || null,
      date: dateUtc,
      reason: parsed.data.reason || null,
    },
  })

  revalidatePath('/admin/blocked-dates')
  return { ok: true }
}

export async function removeBlockedDate(formData: FormData) {
  await requireRole('ADMIN')

  const parsed = blockedDateIdSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) return { ok: false, error: 'Invalid ID.' }

  await prisma.blockedDate.delete({ where: { id: parsed.data.id } })

  revalidatePath('/admin/blocked-dates')
  return { ok: true }
}
