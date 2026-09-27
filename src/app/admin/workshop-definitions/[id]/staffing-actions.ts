'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import {
  draftTeamEditSchema,
  autoFillDraftSchema,
  undoDraftSchema,
} from '@/lib/schemas/draft-workspace'
import {
  applyDraftTeamEdit,
  fillDraftTeams,
  undoDraftOperation,
  type DraftCommandResult,
} from '@/lib/scheduling/draft-operations'
import { scheduleTransaction, SchedulingError } from '@/lib/scheduling/store'

function refresh(id: string) {
  revalidatePath('/admin/workshop-definitions/' + id)
  revalidatePath('/admin/workshops', 'layout')
  revalidatePath('/admin')
}
function failure(error: unknown): DraftCommandResult {
  if (error instanceof SchedulingError) return { error: error.message }
  throw error
}

export async function editDraftTeam(input: unknown): Promise<DraftCommandResult> {
  const actor = await requireRole('ADMIN')
  const parsed = draftTeamEditSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  try {
    const result = await scheduleTransaction((tx) => applyDraftTeamEdit(tx, actor, parsed.data))
    refresh(parsed.data.workshopDefinitionId)
    return result
  } catch (error) {
    return failure(error)
  }
}
export async function autoFillDraftTeam(input: unknown): Promise<DraftCommandResult> {
  const actor = await requireRole('ADMIN')
  const parsed = autoFillDraftSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  try {
    const result = await fillDraftTeams(actor, parsed.data)
    refresh(parsed.data.workshopDefinitionId)
    return result
  } catch (error) {
    return failure(error)
  }
}
export async function undoDraftTeam(input: unknown): Promise<DraftCommandResult> {
  const actor = await requireRole('ADMIN')
  const parsed = undoDraftSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  try {
    const result = await scheduleTransaction((tx) => undoDraftOperation(tx, actor, parsed.data))
    refresh(parsed.data.workshopDefinitionId)
    return result
  } catch (error) {
    return failure(error)
  }
}
