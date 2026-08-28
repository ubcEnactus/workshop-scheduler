// Commute time estimation between Vancouver-area communities.
//
// Adding a new community: add it to COMMUNITIES, then add a row+column to the
// TRAVEL_MATRIX with estimated one-way transit/drive times in minutes.

export const COMMUNITIES = [
  'UBC',
  'Vancouver',
  'Burnaby',
  'North Vancouver',
  'Richmond',
  'Surrey',
] as const

export type Community = (typeof COMMUNITIES)[number]

// Symmetric one-way travel time in minutes (approximate, by transit during
// school hours). Order matches COMMUNITIES index.
//        UBC  Van  Bby  NVan Rich Surr
const TRAVEL_MATRIX: number[][] = [
  [0, 25, 40, 50, 40, 60], // UBC
  [25, 0, 25, 30, 25, 45], // Vancouver
  [40, 25, 0, 40, 35, 30], // Burnaby
  [50, 30, 40, 0, 45, 55], // North Vancouver
  [40, 25, 35, 45, 0, 30], // Richmond
  [60, 45, 30, 55, 30, 0], // Surrey
]

const communityIndex = new Map<string, number>(COMMUNITIES.map((c, i) => [c, i]))

export function isCommunity(value: string): value is Community {
  return communityIndex.has(value)
}

/**
 * One-way travel time in minutes between two communities.
 * Returns null if either community is unknown.
 */
export function getCommuteMinutes(from: string, to: string): number | null {
  const i = communityIndex.get(from)
  const j = communityIndex.get(to)
  if (i === undefined || j === undefined) return null
  return TRAVEL_MATRIX[i][j]
}

/**
 * Whether a PA based in `paCommunity` can reasonably commute to a school in
 * `schoolCommunity` given a maximum acceptable one-way travel time.
 *
 * Default threshold: 45 minutes. PAs with unknown or null community are
 * assumed reachable (don't penalize incomplete data).
 */
export function canCommute(
  paCommunity: string | null | undefined,
  schoolCommunity: string | null | undefined,
  maxMinutes = 45
): boolean {
  if (!paCommunity || !schoolCommunity) return true
  const minutes = getCommuteMinutes(paCommunity, schoolCommunity)
  if (minutes === null) return true
  return minutes <= maxMinutes
}

/**
 * Sort PAs by commute time to a school (shortest first). PAs with unknown
 * community sort last (treated as max commute).
 */
export function sortByCommute(
  paIds: string[],
  paCommunities: Map<string, string | null>,
  schoolCommunity: string | null | undefined
): string[] {
  if (!schoolCommunity) return paIds

  return [...paIds].sort((a, b) => {
    const commuteA = getCommuteMinutes(paCommunities.get(a) ?? '', schoolCommunity) ?? 999
    const commuteB = getCommuteMinutes(paCommunities.get(b) ?? '', schoolCommunity) ?? 999
    return commuteA - commuteB
  })
}
