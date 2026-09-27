'use server'

import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { batchSchema, type PlanningBatchInput } from '@/lib/schemas/planning'
import { workshopSchema, clockMinutes } from '@/lib/schemas/workshops'
import {
  scheduleTransaction,
  SchedulingError,
  validateSlot,
  loadSchedule,
} from '@/lib/scheduling/store'
import { matchWorkshops } from '@/lib/scheduling/matcher'
import { assessAssignment, type ScheduledWorkshop } from '@/lib/scheduling/eligibility'
import { scheduleHash } from '@/lib/scheduling/matching-preview'
import { formatInstantRange, vancouverDateKey } from '@/lib/time'
import {
  automaticBackupCount,
  feasibilityPlanKind,
  findManualFeasibilityPlan,
} from '@/lib/scheduling/manual-feasibility'

export type PlanningPreviewState = {
  error?: string
  previewKey?: string
  scheduleHash?: string
  status?: 'READY' | 'REVIEW_REQUIRED' | 'NO_VALID_PLAN'
  rows?: {
    classWorkshopId: string
    assigned: number
    required: number
    automaticBackups: number
    reviewCandidates: number
    sessionLabel: string
    staffing: {
      paId: string
      paName: string
      warningCodes: ('SAME_DAY' | 'SAME_WEEK')[]
    }[]
    reasons: string[]
  }[]
  manualPlan?: {
    kind: 'WEEKLY' | 'SAME_DAY'
  }
  manualSearchBudgetReached?: boolean
}

export type PlanningSaveState = {
  error?: string
  destination?: string
}

function parseBatch(form: FormData): { error: string } | { data: PlanningBatchInput } {
  const columns = ['classWorkshopId', 'date', 'startTime'] as const
  const ids = form.getAll('classWorkshopId')
  const parsed = batchSchema.safeParse({
    requestKey: form.get('requestKey'),
    workshopDefinitionId: form.get('workshopDefinitionId'),
    expectedDefinitionRevision: form.get('expectedDefinitionRevision'),
    expectedScheduleHash: form.get('expectedScheduleHash') || undefined,
    destination: form.get('destination') || undefined,
    returnWeek: form.get('returnWeek') || undefined,
    returnClassSectionId: form.get('returnClassSectionId') || undefined,
    mode: form.get('mode') || undefined,
    location: form.get('location') || '',
    notes: form.get('notes') || '',
    participantInstructions: form.get('participantInstructions') || '',
    slots: ids.map((_, index) =>
      Object.fromEntries(columns.map((key) => [key, form.getAll(key)[index]]))
    ),
  })
  if (!parsed.success || columns.some((key) => form.getAll(key).length !== ids.length))
    return {
      error: parsed.success ? 'Incomplete candidate rows.' : parsed.error.issues[0].message,
    }
  return { data: parsed.data }
}

function previewKey(input: PlanningBatchInput) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        workshopDefinitionId: input.workshopDefinitionId,
        revision: input.expectedDefinitionRevision,
        mode: input.mode,
        location: input.location,
        notes: input.notes,
        participantInstructions: input.participantInstructions,
        slots: input.slots,
      })
    )
    .digest('hex')
}

function clock(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

async function proposedWorkshops(tx: Prisma.TransactionClient, input: PlanningBatchInput) {
  const definition = await tx.workshopDefinition.findUnique({
    where: { id: input.workshopDefinitionId },
  })
  if (!definition || definition.revision !== input.expectedDefinitionRevision)
    throw new SchedulingError('This workshop run changed. Refresh the planning board.')
  const result: {
    classWorkshopId: string
    workshop: ScheduledWorkshop
    data: Awaited<ReturnType<typeof validateSlot>>
  }[] = []
  for (const [index, slot] of input.slots.entries()) {
    const classWorkshop = await tx.classWorkshop.findFirst({
      where: {
        id: slot.classWorkshopId,
        workshopDefinitionId: definition.id,
        status: { not: 'WAIVED' },
      },
      include: {
        classSection: {
          include: { school: true, teacher: true },
        },
      },
    })
    if (!classWorkshop)
      throw new SchedulingError('An enrolled teacher changed. Refresh the planning board.')
    const duration = definition.durationMinutes ?? classWorkshop.classSection.defaultDurationMinutes
    const startMinute = clockMinutes(slot.startTime)
    const inputData = workshopSchema.safeParse({
      classSectionId: classWorkshop.classSectionId,
      workshopDefinitionId: definition.id,
      date: slot.date,
      startTime: slot.startTime,
      endTime: clock(startMinute + duration),
      minPAs: definition.defaultMinPAs,
      maxPAs: definition.defaultMaxPAs,
      mode: input.mode,
      location: input.location,
      notes: input.notes,
      participantInstructions: input.participantInstructions,
    })
    if (!inputData.success) throw new SchedulingError(inputData.error.issues[0].message)
    const data = await validateSlot(tx, inputData.data)
    result.push({
      classWorkshopId: classWorkshop.id,
      data,
      workshop: {
        id: `planning:${index}:${classWorkshop.id}`,
        workshopDefinitionId: definition.id,
        definitionTitle: definition.title,
        classSectionId: classWorkshop.classSectionId,
        schoolId: classWorkshop.classSection.schoolId,
        schoolName: classWorkshop.classSection.school.name,
        scheduledStart: data.scheduledStart,
        scheduledEnd: data.scheduledEnd,
        minPAs: data.minPAs,
        maxPAs: data.maxPAs,
        status: 'DRAFT',
        version: 0,
        locked: false,
        mode: input.mode,
        location: input.location || null,
        activeClass: true,
        hostingValid: true,
        assignments: [],
      },
    })
  }
  return result
}

export async function previewWorkshopBatchForm(
  _state: PlanningPreviewState,
  form: FormData
): Promise<PlanningPreviewState> {
  await requireRole('ADMIN')
  const parsed = parseBatch(form)
  if ('error' in parsed) return { error: parsed.error }
  try {
    // Keep the consistent read short, then solve outside the transaction. This
    // is diagnostic only; saving dates independently revalidates each host/slot.
    const [snapshot, proposed] = await prisma.$transaction(
      async (tx) =>
        Promise.all([
          loadSchedule(tx, {
            kind: 'run',
            workshopDefinitionId: parsed.data.workshopDefinitionId,
          }),
          proposedWorkshops(tx, parsed.data),
        ]),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    )
    const inputHash = scheduleHash(snapshot)
    snapshot.workshops.push(...proposed.map((item) => item.workshop))
    const targetIds = proposed.map((item) => item.workshop.id)
    const plan = matchWorkshops(snapshot, targetIds)
    for (const proposal of plan) {
      const workshop = snapshot.workshops.find((item) => item.id === proposal.workshopSessionId)!
      const existing = new Map(
        workshop.assignments.map((assignment) => [assignment.paId, assignment])
      )
      workshop.assignments = proposal.paIds.map(
        (paId) =>
          existing.get(paId) ?? {
            paId,
            status: 'DRAFT',
            source: 'AUTOMATIC',
            overrideSameDay: false,
            overrideWeek: false,
            overrideReason: null,
          }
      )
    }
    const matcherComplete = plan.every((proposal) => {
      const workshop = snapshot.workshops.find((item) => item.id === proposal.workshopSessionId)!
      return proposal.paIds.length >= workshop.minPAs
    })
    const weeklyPlan = matcherComplete
      ? null
      : findManualFeasibilityPlan(snapshot, targetIds, 'WEEKLY')
    const sameDayPlan =
      weeklyPlan?.status === 'NO_PLAN_FOUND'
        ? findManualFeasibilityPlan(snapshot, targetIds, 'SAME_DAY')
        : null
    const feasibilityPlan =
      weeklyPlan?.status === 'COMPLETE'
        ? weeklyPlan
        : sameDayPlan?.status === 'COMPLETE'
          ? sameDayPlan
          : null
    const feasibilityKind = feasibilityPlanKind(feasibilityPlan)
    const automaticRecoveryPlan = feasibilityKind === 'AUTOMATIC' ? feasibilityPlan : null
    if (automaticRecoveryPlan)
      for (const assignment of automaticRecoveryPlan.assignments) {
        const workshop = snapshot.workshops.find(
          (item) => item.id === assignment.workshopSessionId
        )!
        workshop.assignments.push({
          paId: assignment.paId,
          status: 'DRAFT',
          source: 'AUTOMATIC',
          overrideSameDay: false,
          overrideWeek: false,
          overrideReason: null,
        })
      }
    const automaticComplete = matcherComplete || !!automaticRecoveryPlan
    const manualPlan =
      feasibilityKind === 'SAME_DAY' || feasibilityKind === 'WEEKLY'
        ? {
            kind: feasibilityKind,
          }
        : undefined
    const manualSearchBudgetReached =
      weeklyPlan?.status === 'BUDGET_REACHED' || sameDayPlan?.status === 'BUDGET_REACHED'
    const rows = plan.map((proposal) => {
      const workshop = proposed.find(
        (item) => item.workshop.id === proposal.workshopSessionId
      )!.workshop
      const reviewCandidates = snapshot.pas
        .filter((pa) => !workshop.assignments.some((assignment) => assignment.paId === pa.id))
        .map((pa) => assessAssignment(snapshot, workshop, pa.id))
        .filter(
          (assessment) =>
            assessment.manualEligible &&
            assessment.availabilityWarnings.length === 0 &&
            assessment.manualWarnings.length > 0
        )
      const manualAssignments = manualPlan
        ? (feasibilityPlan?.assignments.filter(
            (assignment) => assignment.workshopSessionId === proposal.workshopSessionId
          ) ?? [])
        : []
      const staffing = [
        ...workshop.assignments.map((assignment) => ({
          paId: assignment.paId,
          warningCodes: [] as ('SAME_DAY' | 'SAME_WEEK')[],
        })),
        ...manualAssignments.map((assignment) => ({
          paId: assignment.paId,
          warningCodes: assignment.warningCodes,
        })),
      ].map((assignment) => ({
        ...assignment,
        paName:
          snapshot.pas.find((pa) => pa.id === assignment.paId)?.name ??
          snapshot.pas.find((pa) => pa.id === assignment.paId)?.email ??
          'Unknown PA',
      }))
      return {
        classWorkshopId: proposed.find((item) => item.workshop.id === proposal.workshopSessionId)!
          .classWorkshopId,
        assigned: workshop.assignments.length,
        required: workshop.minPAs,
        automaticBackups: automaticComplete
          ? automaticBackupCount(snapshot, proposal.workshopSessionId)
          : 0,
        reviewCandidates: reviewCandidates.length,
        sessionLabel: formatInstantRange(workshop.scheduledStart, workshop.scheduledEnd),
        staffing,
        reasons: [
          ...proposal.reasons,
          ...(!manualPlan && reviewCandidates.length
            ? [
                `${reviewCandidates.length} PA candidate${reviewCandidates.length === 1 ? '' : 's'} available with workload warnings.`,
              ]
            : []),
        ],
      }
    })
    return {
      previewKey: previewKey(parsed.data),
      scheduleHash: inputHash,
      status: automaticComplete
        ? ('READY' as const)
        : manualPlan || manualSearchBudgetReached
          ? ('REVIEW_REQUIRED' as const)
          : ('NO_VALID_PLAN' as const),
      rows,
      manualPlan,
      manualSearchBudgetReached,
    }
  } catch (error) {
    if (error instanceof SchedulingError) return { error: error.message }
    throw error
  }
}

type BatchMutationResult =
  | { error: string }
  | {
      batchId: string
      workshopDefinitionId: string
      created: number
      destination: 'plan' | 'staff'
      week?: string
      classSectionId?: string
    }

async function runBatch(actor: { id: string }, form: FormData): Promise<BatchMutationResult> {
  const parsed = parseBatch(form)
  if ('error' in parsed) return { error: parsed.error }
  const input = parsed.data
  const payloadHash = previewKey(input)
  try {
    const batchId = await scheduleTransaction(async (tx) => {
      const prior = await tx.workshopBatch.findUnique({ where: { requestKey: input.requestKey } })
      if (prior) {
        if (prior.actorId !== actor.id || prior.payloadHash !== payloadHash)
          throw new SchedulingError(
            'This request key was already used for different workshop choices. Reload and review your date choices.'
          )
        return prior.id
      }
      // A staffing estimate never authorizes (or vetoes) date creation. Validate
      // current hosting/date inputs below even when PA availability has changed.
      const proposed = await proposedWorkshops(tx, input)
      const batch = await tx.workshopBatch.create({
        data: {
          requestKey: input.requestKey,
          month: vancouverDateKey(proposed[0].data.scheduledStart).slice(0, 7),
          payloadHash,
          actorId: actor.id,
        },
      })
      for (const item of proposed) {
        await tx.workshopSession.create({
          data: {
            ...item.data,
            batchId: batch.id,
            mode: input.mode,
            location: input.location || null,
            notes: input.notes || null,
            participantInstructions: input.participantInstructions || null,
          },
        })
        await tx.classWorkshop.update({
          where: { id: item.classWorkshopId },
          data: { status: 'SCHEDULED', revision: { increment: 1 } },
        })
      }
      return batch.id
    })
    return {
      batchId,
      workshopDefinitionId: input.workshopDefinitionId,
      created: input.slots.length,
      destination: input.destination,
      week: input.returnWeek,
      classSectionId: input.returnClassSectionId,
    }
  } catch (error) {
    if (error instanceof SchedulingError) return { error: error.message }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2034'].includes(error.code)
    )
      return { error: 'The schedule changed. Reload and try again.' }
    throw error
  }
}

export async function createWorkshopBatch(form: FormData) {
  const actor = await requireRole('ADMIN')
  const result = await runBatch(actor, form)
  if ('error' in result) redirect(`/admin/workshops/plan?error=${encodeURIComponent(result.error)}`)
  revalidatePath('/admin', 'layout')
  redirect(savedDatesHref(result))
}

function savedDatesHref(result: Exclude<BatchMutationResult, { error: string }>) {
  const params = new URLSearchParams({ step: result.destination, created: String(result.created) })
  if (result.destination === 'staff') params.set('batch', result.batchId)
  if (result.week) params.set('week', result.week)
  // A saved batch can include several classes even when Plan opened focused on one.
  if (result.destination === 'plan' && result.classSectionId)
    params.set('classSectionId', result.classSectionId)
  return `/admin/workshop-definitions/${encodeURIComponent(result.workshopDefinitionId)}?${params}`
}

export async function createWorkshopBatchForm(
  _state: PlanningSaveState,
  form: FormData
): Promise<PlanningSaveState> {
  const actor = await requireRole('ADMIN')
  const result = await runBatch(actor, form)
  if ('error' in result) return { error: result.error }
  // The client acknowledges the save, then opens a fresh workshop document.
  // Revalidating here can unmount its embedded form before it receives this URL.
  return { destination: savedDatesHref(result) }
}
