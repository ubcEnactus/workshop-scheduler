// PA workshop quota management.
//
// Each PA has a monthly quota (User.monthlyQuota or a system default). The
// scheduler uses this to distribute workshops fairly across PAs.

import { prisma } from '@/lib/db'

export const DEFAULT_MONTHLY_QUOTA = 4

/**
 * Count confirmed + proposed assignments per PA within a cycle.
 * Returns a map of paId → assignment count.
 */
export async function getAssignmentCountsForCycle(
  paIds: string[],
  cycleId: string
): Promise<Map<string, number>> {
  if (paIds.length === 0) return new Map()

  const counts = await prisma.assignment.groupBy({
    by: ['paId'],
    where: {
      paId: { in: paIds },
      workshop: { cycleId },
      status: { in: ['PROPOSED', 'CONFIRMED'] },
    },
    _count: { id: true },
  })

  const result = new Map<string, number>()
  for (const id of paIds) result.set(id, 0)
  for (const row of counts) result.set(row.paId, row._count.id)
  return result
}

/**
 * Get PA quotas. Returns map of paId → monthly quota.
 */
export async function getPAQuotas(paIds: string[]): Promise<Map<string, number>> {
  if (paIds.length === 0) return new Map()

  const users = await prisma.user.findMany({
    where: { id: { in: paIds } },
    select: { id: true, monthlyQuota: true },
  })

  const result = new Map<string, number>()
  for (const u of users) {
    result.set(u.id, u.monthlyQuota ?? DEFAULT_MONTHLY_QUOTA)
  }
  return result
}

/**
 * Sort PA IDs by quota deficit (most under-quota first). PAs who have already
 * met or exceeded their quota sort last.
 *
 * Pure function — caller provides the counts and quotas.
 */
export function sortByQuotaDeficit(
  paIds: string[],
  assignmentCounts: Map<string, number>,
  quotas: Map<string, number>
): string[] {
  return [...paIds].sort((a, b) => {
    const deficitA = (quotas.get(a) ?? DEFAULT_MONTHLY_QUOTA) - (assignmentCounts.get(a) ?? 0)
    const deficitB = (quotas.get(b) ?? DEFAULT_MONTHLY_QUOTA) - (assignmentCounts.get(b) ?? 0)
    return deficitB - deficitA // higher deficit = more needy = first
  })
}

/**
 * Filter out PAs who have already met their monthly quota.
 */
export function filterOverQuota(
  paIds: string[],
  assignmentCounts: Map<string, number>,
  quotas: Map<string, number>
): string[] {
  return paIds.filter((id) => {
    const count = assignmentCounts.get(id) ?? 0
    const quota = quotas.get(id) ?? DEFAULT_MONTHLY_QUOTA
    return count < quota
  })
}
