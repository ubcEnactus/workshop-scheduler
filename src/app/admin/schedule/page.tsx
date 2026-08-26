import type { WorkshopStatus } from '@prisma/client'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { findOpenCycle } from '@/lib/scheduling/cycle'
import { formatInstantRange } from '@/lib/time'
import { ScheduleClient, type ScheduleRow } from './ScheduleClient'

/**
 * The proposal query lives here rather than in `actions.ts` — anything
 * exported from a 'use server' module becomes a callable endpoint, and this
 * is a read the Server Component can do directly.
 *
 * Rows are fully rendered here, times included: Node and Chrome ship
 * different ICU builds, so formatting an instant on both sides of hydration
 * produces strings that differ by an invisible space and React rejects them.
 */
export default async function AdminSchedulePage() {
  await requireRole('ADMIN')

  const cycle = await findOpenCycle()

  if (!cycle) return <ScheduleClient cycleName={null} rows={[]} />

  const [workshops, assignments, pas] = await Promise.all([
    prisma.workshop.findMany({
      where: { cycleId: cycle.id },
      include: { classSection: { select: { name: true, school: { select: { name: true } } } } },
      orderBy: [{ scheduledStart: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    }),
    prisma.assignment.findMany({ where: { workshop: { cycleId: cycle.id } } }),
    prisma.user.findMany({
      where: { role: 'PA', deletedAt: null },
      select: { id: true, name: true, email: true },
    }),
  ])

  const paLabel = (id: string) => {
    const pa = pas.find((p) => p.id === id)
    return pa?.name ?? pa?.email ?? 'Unknown PA'
  }

  const rows: ScheduleRow[] = workshops.map((ws) => ({
    id: ws.id,
    className: ws.classSection.name,
    schoolName: ws.classSection.school.name,
    time:
      ws.scheduledStart && ws.scheduledEnd
        ? formatInstantRange(ws.scheduledStart, ws.scheduledEnd)
        : null,
    status: ws.status as WorkshopStatus,
    pas: assignments.filter((a) => a.workshopId === ws.id).map((a) => paLabel(a.paId)),
  }))

  return <ScheduleClient cycleName={cycle.name} rows={rows} />
}
