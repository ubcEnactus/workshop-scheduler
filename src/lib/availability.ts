import { scheduleTransaction } from '@/lib/scheduling/store'

/**
 * Replace a user's entire weekly availability with `slots`.
 *
 * Replace-the-whole-set semantics: the grid form posts only checked boxes,
 * so anything absent is intentionally cleared. The delete + createMany run
 * in one transaction; `skipDuplicates` makes a payload containing repeats
 * harmless (the `@@unique([userId, dayOfWeek, startMin])` constraint is the
 * DB backstop).
 *
 * Callers (the per-role Server Actions) are responsible for requireRole +
 * Zod validation before calling this.
 */
export async function replaceAvailability(
  userId: string,
  slots: { dayOfWeek: number; startMin: number }[]
): Promise<void> {
  await scheduleTransaction(async (tx) => {
    await tx.availability.deleteMany({ where: { userId } })
    await tx.availability.createMany({
      data: slots.map((s) => ({ userId, ...s })),
      skipDuplicates: true,
    })
  })
}
