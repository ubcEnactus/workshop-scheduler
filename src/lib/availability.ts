import { prisma } from '@/lib/db'

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
  await prisma.$transaction([
    prisma.availability.deleteMany({ where: { userId } }),
    prisma.availability.createMany({
      data: slots.map((s) => ({ userId, ...s })),
      skipDuplicates: true,
    }),
  ])
}
