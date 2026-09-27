'use server'

import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { matchingScopeSchema, previewIdSchema, previewStaffingSchema } from '@/lib/schemas/matching'
import type { PreviewStaffingView } from '@/lib/scheduling/preview-staffing'

/** Legacy forms navigate to the persistent draft; they never rebuild saved teams. */
export async function previewMatching(formData: FormData) {
  await requireRole('ADMIN')
  const definitionId = formData.get('workshopDefinitionId')
  const kind = formData.get('scopeKind') ?? (definitionId ? 'workshop' : 'month')
  const parsed = matchingScopeSchema.safeParse({
    kind,
    workshopDefinitionId: definitionId,
    batchId: formData.get('batchId'),
    workshopSessionIds: formData.getAll('sessionId'),
    month: formData.get('month'),
    classIds: formData.getAll('classId'),
  })
  if (!parsed.success) redirect('/admin/workshops/match?error=Choose+a+workshop+to+staff.')
  const scope = parsed.data
  if (scope.kind === 'month') {
    const legacy = new URLSearchParams({ month: scope.month, scopeKind: 'month' })
    scope.classIds.forEach((id) => legacy.append('classId', id))
    redirect('/admin/workshops/match?' + legacy)
  }
  const query = new URLSearchParams({ step: 'staff' })
  if (scope.kind === 'batch') query.set('batch', scope.batchId)
  if (scope.kind === 'sessions')
    scope.workshopSessionIds.forEach((id) => query.append('sessionId', id))
  redirect('/admin/workshop-definitions/' + scope.workshopDefinitionId + '?' + query)
}

export async function editPreviewStaffing(
  input: unknown
): Promise<{ error?: string; view?: PreviewStaffingView }> {
  await requireRole('ADMIN')
  const parsed = previewStaffingSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  return {
    error: 'This is an archived proposal. Open the workshop Staff view to edit the saved draft.',
  }
}

export async function applyMatching(formData: FormData) {
  const actor = await requireRole('ADMIN')
  const parsed = previewIdSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/admin/workshops/match?error=Invalid+proposal.')
  const preview = await prisma.matchingPreview.findFirst({
    where: { id: parsed.data.id, actorId: actor.id },
    select: { id: true },
  })
  if (!preview) redirect('/admin/workshops/match?error=Proposal+unavailable.')
  redirect(
    '/admin/workshops/match/' +
      preview.id +
      '?error=Archived+proposals+cannot+change+the+saved+draft.'
  )
}
