import type { Prisma } from '@prisma/client'

/** Shared server read shape for the run overview and its embedded date planner. */
export const runWorkspaceInclude = {
  classWorkshops: {
    include: {
      availabilitySlots: true,
      classSection: {
        include: {
          school: { include: { closures: true } },
          teacher: true,
          meetings: { include: { skips: true } },
          availabilityExceptions: true,
          availabilitySlots: true,
        },
      },
      sessions: { orderBy: { createdAt: 'desc' }, include: { assignments: true } },
    },
  },
} satisfies Prisma.WorkshopDefinitionInclude

export type RunWorkspaceRecord = Prisma.WorkshopDefinitionGetPayload<{
  include: typeof runWorkspaceInclude
}>
