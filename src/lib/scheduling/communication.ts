import { auditStateSchema } from '@/lib/schemas/changes'

/** Internal notes and approval reasons never create participant messages. */
export function needsCommunication(event: {
  kind: string
  wasPublished: boolean
  before: unknown
  after: unknown
}) {
  if (!event.wasPublished || event.kind === 'COMPLETE' || event.kind === 'INTERNAL_EDIT')
    return false
  if (event.kind === 'PUBLISH') return true
  const before = auditStateSchema.safeParse(event.before)
  const after = auditStateSchema.safeParse(event.after)
  if (!before.success || !after.success) return true
  const publicState = (state: typeof before.data) =>
    state && {
      status: state.status,
      start: state.start,
      end: state.end,
      mode: state.mode,
      location: state.location,
      participantInstructions: state.participantInstructions,
      hostTeacherName: state.hostTeacherName,
      pas: state.pas.map((pa) => pa.id).sort(),
    }
  return JSON.stringify(publicState(before.data)) !== JSON.stringify(publicState(after.data))
}
