import { auditStateSchema } from '@/lib/schemas/changes'

type PublicWorkshopEvent = {
  kind: string
  before: unknown
  after: unknown
}

/** Describes only fields that participants are allowed to see. */
export function participantChangeSummary(event: PublicWorkshopEvent) {
  if (event.kind === 'CANCEL') return 'This workshop was cancelled.'
  if (event.kind === 'COMPLETE') return 'This workshop was marked completed.'

  const before = auditStateSchema.safeParse(event.before)
  const after = auditStateSchema.safeParse(event.after)
  if (!before.success || !after.success) return 'Workshop details were updated.'

  const changes: string[] = []
  if (before.data.start !== after.data.start || before.data.end !== after.data.end)
    changes.push('date or time')
  if (before.data.mode !== after.data.mode || before.data.location !== after.data.location)
    changes.push('format or location')
  if (before.data.participantInstructions !== after.data.participantInstructions)
    changes.push('instructions')
  if (before.data.hostTeacherName !== after.data.hostTeacherName) changes.push('host teacher')
  if (
    before.data.pas
      .map((pa) => pa.id)
      .sort()
      .join('|') !==
    after.data.pas
      .map((pa) => pa.id)
      .sort()
      .join('|')
  )
    changes.push('PA team')

  return changes.length
    ? `${changes.join(', ')} ${changes.length === 1 ? 'was' : 'were'} updated.`
    : 'Workshop details were updated.'
}
