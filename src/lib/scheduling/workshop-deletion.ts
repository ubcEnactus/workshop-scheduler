import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'

export const workshopDeletionInclude = {
  classWorkshops: {
    orderBy: { id: 'asc' },
    include: {
      availabilitySlots: { orderBy: { id: 'asc' } },
      sessions: {
        orderBy: { id: 'asc' },
        include: {
          assignments: { orderBy: { id: 'asc' } },
          changes: { orderBy: { id: 'asc' } },
          events: { orderBy: { id: 'asc' } },
        },
      },
    },
  },
} satisfies Prisma.WorkshopDefinitionInclude

export type WorkshopDeletionRecord = Prisma.WorkshopDefinitionGetPayload<{
  include: typeof workshopDeletionInclude
}>

export type WorkshopDeletionSummary = {
  hash: string
  includedClasses: number
  draftSessions: number
  assignments: number
  candidateTimes: number
  blockedReason?: string
}

function canonicalValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalValue(item)])
    )
  return value
}

export function summarizeWorkshopDeletion(record: WorkshopDeletionRecord): WorkshopDeletionSummary {
  const sessions = record.classWorkshops.flatMap((enrollment) => enrollment.sessions)
  const assignments = sessions.flatMap((session) => session.assignments)
  const events = sessions.flatMap((session) => session.events)
  const hasProtectedHistory =
    record.classWorkshops.some((enrollment) => enrollment.status === 'COMPLETED') ||
    sessions.some((session) => session.status !== 'DRAFT' || session.publishedAt !== null) ||
    assignments.some((assignment) => assignment.status === 'PUBLISHED') ||
    events.some((event) => event.wasPublished)

  return {
    hash: createHash('sha256')
      .update(JSON.stringify(canonicalValue(record)))
      .digest('hex'),
    includedClasses: record.classWorkshops.length,
    draftSessions: sessions.filter((session) => session.status === 'DRAFT').length,
    assignments: assignments.length,
    candidateTimes: record.classWorkshops.reduce(
      (total, enrollment) => total + enrollment.availabilitySlots.length,
      0
    ),
    ...(hasProtectedHistory
      ? {
          blockedReason:
            'This workshop has published, completed, or cancelled history and cannot be deleted.',
        }
      : {}),
  }
}
