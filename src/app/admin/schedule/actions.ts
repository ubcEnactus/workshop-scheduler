'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { runSchedule } from '@/lib/scheduling/algorithm'
import { coalesceAvailability } from '@/lib/scheduling/availability'
import { findOpenCycle } from '@/lib/scheduling/cycle'
import { workshopIdSchema } from '@/lib/schemas/scheduling'

/**
 * Both actions operate on the single OPEN cycle rather than taking an id, so
 * there's no client input to validate — an admin can only ever act on the
 * cycle that's currently accepting availability.
 *
 * They return a result object instead of throwing: Next replaces thrown
 * Server Action messages with a generic string in production, which would
 * turn "no open cycle" into an unactionable error on screen.
 */
export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string }

export async function runScheduleAction(): Promise<
  ActionResult<{ scheduled: number; unscheduled: number }>
> {
  await requireRole('ADMIN')

  const cycle = await findOpenCycle()
  if (!cycle) return { ok: false, error: 'No open cycle — open one from Cycles first.' }

  const [classMeetings, workshops, assignments, slots] = await Promise.all([
    prisma.classMeeting.findMany({
      where: { classSection: { school: { deletedAt: null }, teacher: { deletedAt: null } } },
    }),
    prisma.workshop.findMany({ where: { cycleId: cycle.id } }),
    prisma.assignment.findMany({ where: { workshop: { cycleId: cycle.id } } }),
    // Only PAs staff workshops; teacher availability is recorded but unused here.
    prisma.availability.findMany({
      where: { user: { role: 'PA', deletedAt: null } },
      select: { userId: true, dayOfWeek: true, startMin: true },
      orderBy: [{ userId: 'asc' }, { dayOfWeek: 'asc' }, { startMin: 'asc' }],
    }),
  ])

  const result = runSchedule(
    cycle,
    classMeetings,
    workshops,
    assignments,
    coalesceAvailability(slots),
    () => randomUUID()
  )

  await prisma.$transaction(async (tx) => {
    // Proposals are regenerated wholesale; confirmed assignments are carried
    // through by the algorithm and must survive this delete.
    await tx.assignment.deleteMany({
      where: { status: 'PROPOSED', workshop: { cycleId: cycle.id } },
    })

    const proposed = result.assignments.filter((a) => a.status === 'PROPOSED')
    if (proposed.length > 0) {
      await tx.assignment.createMany({
        data: proposed.map((a) => ({
          id: a.id,
          workshopId: a.workshopId,
          paId: a.paId,
          status: a.status,
        })),
      })
    }

    for (const ws of result.workshops) {
      await tx.workshop.update({
        where: { id: ws.id },
        data: {
          status: ws.status,
          scheduledStart: ws.scheduledStart,
          scheduledEnd: ws.scheduledEnd,
        },
      })
    }
  })

  revalidatePath('/admin/schedule')
  return {
    ok: true,
    scheduled: result.workshops.filter((w) => w.status === 'SCHEDULED').length,
    unscheduled: result.workshops.filter((w) => w.status === 'UNSCHEDULED').length,
  }
}

export async function confirmAllAction(): Promise<ActionResult> {
  await requireRole('ADMIN')

  const cycle = await findOpenCycle()
  if (!cycle) return { ok: false, error: 'No open cycle — open one from Cycles first.' }

  await prisma.$transaction([
    prisma.assignment.updateMany({
      where: { status: 'PROPOSED', workshop: { cycleId: cycle.id } },
      data: { status: 'CONFIRMED' },
    }),
    prisma.workshop.updateMany({
      where: { status: 'SCHEDULED', cycleId: cycle.id },
      data: { status: 'CONFIRMED' },
    }),
  ])

  revalidatePath('/admin/schedule')
  revalidatePath('/pa')
  revalidatePath('/teacher')
  return { ok: true }
}

/**
 * Reopen a confirmed workshop — the inverse of `confirmAllAction` for one row.
 *
 * The workshop keeps its time and PAs but returns to SCHEDULED (shown as
 * "Proposed"), which is a status the scheduler is free to re-place. So the
 * reschedule flow, when a teacher or PA can no longer make the slot, is:
 * unconfirm, then Run scheduler for a fresh placement from current
 * availability — or re-confirm as-is if nothing needed to change.
 */
export async function unconfirmWorkshopAction(workshopId: string): Promise<ActionResult> {
  await requireRole('ADMIN')

  const parsed = workshopIdSchema.safeParse({ id: workshopId })
  if (!parsed.success) return { ok: false, error: 'Unknown workshop.' }

  const cycle = await findOpenCycle()
  if (!cycle) return { ok: false, error: 'No open cycle — open one from Cycles first.' }

  // Scoped to the open cycle: an id from a closed cycle isn't reopenable here.
  const workshop = await prisma.workshop.findFirst({
    where: { id: parsed.data.id, cycleId: cycle.id },
    select: { status: true },
  })
  if (!workshop) return { ok: false, error: 'Workshop not found in the open cycle.' }
  if (workshop.status !== 'CONFIRMED') {
    return { ok: false, error: 'Only confirmed workshops can be reopened.' }
  }

  await prisma.$transaction([
    prisma.workshop.updateMany({
      where: { id: parsed.data.id, status: 'CONFIRMED' },
      data: { status: 'SCHEDULED' },
    }),
    prisma.assignment.updateMany({
      where: { workshopId: parsed.data.id, status: 'CONFIRMED' },
      data: { status: 'PROPOSED' },
    }),
  ])

  revalidatePath('/admin/schedule')
  revalidatePath('/pa')
  revalidatePath('/teacher')
  return { ok: true }
}
