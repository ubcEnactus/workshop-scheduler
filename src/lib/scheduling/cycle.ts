import { prisma } from '@/lib/db'

/**
 * The cycle the scheduler operates on.
 *
 * Exactly one cycle is meant to be OPEN at a time — the team runs one semester
 * at a time — but nothing in the schema or `openCycle` enforces it, and the way
 * it breaks in practice is the previous term being left open when the next one
 * is set up. `findFirst` without an ordering then returns whichever row the
 * database happens to hand back, so the page could name one cycle while the
 * action scheduled another.
 *
 * Ordering by start date picks the earliest still-open cycle: the term in
 * progress, rather than one opened ahead of time. `createdAt` breaks ties.
 * This is a determinism guard, not a fix — two open cycles is still a data
 * problem to resolve in the Cycles screen.
 *
 * Every caller must go through this so the page and the actions can't diverge.
 */
export function findOpenCycle() {
  return prisma.cycle.findFirst({
    where: { status: 'OPEN' },
    orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
  })
}
