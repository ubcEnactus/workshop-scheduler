import { scheduleTransaction, SchedulingError } from '@/lib/scheduling/store'
import type { Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'

export async function availabilityRevision(tx: Prisma.TransactionClient, userId: string) {
  const [slots, versions, exceptions] = await Promise.all([
    tx.availability.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
    tx.availabilityScheduleVersion.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
    tx.pAAvailabilityException.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
  ])
  return createHash('sha256').update(JSON.stringify({ slots, versions, exceptions })).digest('hex')
}

export async function checkAvailabilityRevision(tx: Prisma.TransactionClient, userId: string, expectedRevision?: string) {
  if (!await tx.user.findFirst({ where: { id: userId, role: 'PA', deletedAt: null }, select: { id: true } }))
    throw new SchedulingError('This PA is no longer available.')
  if (expectedRevision && await availabilityRevision(tx, userId) !== expectedRevision)
    throw new SchedulingError('This schedule changed. Reload before saving your changes.')
}

/**
 * Replace one effective version of a user's weekly availability with `slots`.
 *
 * Replace-the-whole-set semantics: the grid form posts only checked boxes,
 * so anything absent is intentionally cleared. The delete + createMany run
 * in one transaction; `skipDuplicates` makes a payload containing repeats
 * harmless (the `@@unique([userId, dayOfWeek, startMin, effectiveFrom])` constraint is the
 * DB backstop).
 *
 * Callers (the per-role Server Actions) are responsible for requireRole +
 * Zod validation before calling this.
 */
export async function replaceAvailability(
  userId: string,
  slots: { dayOfWeek: number; startMin: number }[],
  effectiveFrom: string,
  expectedRevision?: string
): Promise<void> {
  await scheduleTransaction(async (tx) => {
    await checkAvailabilityRevision(tx, userId, expectedRevision)
    const start = new Date(`${effectiveFrom}T00:00:00.000Z`)
    const priorDay = new Date(start)
    priorDay.setUTCDate(priorDay.getUTCDate() - 1)
    const next = await tx.availabilityScheduleVersion.findFirst({
      where: { userId, effectiveFrom: { gt: start } },
      orderBy: { effectiveFrom: 'asc' },
      select: { effectiveFrom: true },
    })
    const effectiveUntil = next
      ? new Date(next.effectiveFrom.getTime() - 24 * 60 * 60 * 1000)
      : null
    await tx.availability.updateMany({
      where: {
        userId,
        effectiveFrom: { lt: start },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: start } }],
      },
      data: { effectiveUntil: priorDay },
    })
    await tx.availabilityScheduleVersion.updateMany({
      where: {
        userId,
        effectiveFrom: { lt: start },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: start } }],
      },
      data: { effectiveUntil: priorDay },
    })
    await tx.availabilityScheduleVersion.upsert({
      where: { userId_effectiveFrom: { userId, effectiveFrom: start } },
      create: { userId, effectiveFrom: start, effectiveUntil },
      update: { effectiveUntil },
    })
    await tx.availability.deleteMany({ where: { userId, effectiveFrom: start } })
    await tx.availability.createMany({
      data: slots.map((s) => ({ userId, ...s, effectiveFrom: start, effectiveUntil })),
      skipDuplicates: true,
    })
  })
}
