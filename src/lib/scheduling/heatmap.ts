// Heatmap data for the admin "lettucemeet" view.
//
// Provides PA availability counts per time slot, optionally filtered by
// commute feasibility to a specific school's community.

import { prisma } from '@/lib/db'
import { SLOT_STARTS, SLOT_MINUTES, DAY_START_MIN } from '@/lib/schemas/availability'
import { canCommute } from './commute'

export interface HeatmapCell {
  dayOfWeek: number
  startMin: number
  count: number
}

export interface HeatmapPA {
  id: string
  name: string | null
  email: string
  community: string | null
}

/**
 * For each (day, slot) in the weekly grid, count how many PAs are available.
 * Optionally filter by commute feasibility to a target school community.
 *
 * Returns a flat array of cells — one per (day, slot) pair — suitable for
 * rendering as a heatmap grid.
 */
export async function getAvailabilityHeatmap(
  schoolCommunity?: string | null,
  maxCommuteMinutes = 45
): Promise<HeatmapCell[]> {
  // Get all PA availabilities with community info
  const pas = await prisma.user.findMany({
    where: { role: 'PA', deletedAt: null },
    select: { id: true, community: true },
  })

  const reachablePAs = schoolCommunity
    ? new Set(
        pas
          .filter((pa) => canCommute(pa.community, schoolCommunity, maxCommuteMinutes))
          .map((pa) => pa.id)
      )
    : new Set(pas.map((pa) => pa.id))

  // Count availabilities per (day, slot) for reachable PAs
  const availabilities = await prisma.availability.groupBy({
    by: ['dayOfWeek', 'startMin'],
    where: { userId: { in: [...reachablePAs] } },
    _count: { id: true },
  })

  // Build full grid (fill zeroes for empty slots)
  const countMap = new Map<string, number>()
  for (const row of availabilities) {
    countMap.set(`${row.dayOfWeek}-${row.startMin}`, row._count.id)
  }

  const cells: HeatmapCell[] = []
  for (let day = 0; day <= 4; day++) {
    for (const startMin of SLOT_STARTS) {
      cells.push({
        dayOfWeek: day,
        startMin,
        count: countMap.get(`${day}-${startMin}`) ?? 0,
      })
    }
  }

  return cells
}

/**
 * Get the list of PAs available at a specific time slot, optionally filtered
 * by commute to a school community. Used for the hover/detail view.
 */
export async function getPAsAvailableAtSlot(
  dayOfWeek: number,
  startMin: number,
  schoolCommunity?: string | null,
  maxCommuteMinutes = 45
): Promise<HeatmapPA[]> {
  const availabilities = await prisma.availability.findMany({
    where: { dayOfWeek, startMin },
    include: {
      user: {
        select: { id: true, name: true, email: true, community: true, deletedAt: true },
      },
    },
  })

  return availabilities
    .filter((a) => !a.user.deletedAt)
    .filter((a) => canCommute(a.user.community, schoolCommunity, maxCommuteMinutes))
    .map((a) => ({
      id: a.user.id,
      name: a.user.name,
      email: a.user.email,
      community: a.user.community,
    }))
}

/**
 * Get PA availability for a contiguous time range (covers multi-slot meetings).
 * A PA is "available" for the range only if they have slots for every 30-min
 * tick within [startMin, endMin).
 */
export async function getPAsAvailableForRange(
  dayOfWeek: number,
  startMin: number,
  endMin: number,
  schoolCommunity?: string | null,
  maxCommuteMinutes = 45
): Promise<HeatmapPA[]> {
  const slotsNeeded: number[] = []
  for (let m = startMin; m < endMin; m += SLOT_MINUTES) {
    if (m >= DAY_START_MIN) slotsNeeded.push(m)
  }

  if (slotsNeeded.length === 0) return []

  // Get all PAs who have at least one slot on this day in range
  const pas = await prisma.user.findMany({
    where: {
      role: 'PA',
      deletedAt: null,
      availabilities: {
        some: { dayOfWeek, startMin: { in: slotsNeeded } },
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      community: true,
      availabilities: {
        where: { dayOfWeek, startMin: { in: slotsNeeded } },
        select: { startMin: true },
      },
    },
  })

  return pas
    .filter((pa) => {
      // PA must cover ALL slots in the range
      const covered = new Set(pa.availabilities.map((a) => a.startMin))
      return slotsNeeded.every((s) => covered.has(s))
    })
    .filter((pa) => canCommute(pa.community, schoolCommunity, maxCommuteMinutes))
    .map((pa) => ({
      id: pa.id,
      name: pa.name,
      email: pa.email,
      community: pa.community,
    }))
}
