'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import type { WorkshopStatus } from '@prisma/client'
import { publishSelectedDrafts } from '@/app/admin/workshops/workspace-actions'
import { schedulingHref, type SchedulingContext } from '@/lib/scheduling/navigation'
import { Button } from './ui/button'
import { ScheduleTable } from './schedule-table'
import { StaffingDetails } from './staffing-details'
import { OverrideCandidate } from './override-candidate'
import { PAWarnings, PAHistory } from './pa-warnings'
import { useSavedCommand, useSaveNavigationGuard } from './use-saved-command'
import { bulkPublicationSchema } from '@/lib/schemas/workspace'
import {
  editDraftTeam,
  undoDraftTeam,
} from '@/app/admin/workshop-definitions/[id]/staffing-actions'

type DraftCommand = {
  kind: 'edit' | 'undo'
  sessionId: string
  input: Record<string, unknown> & { workshopDefinitionId: string; requestKey: string }
}
const pendingDraftKey = 'calendar-draft-command'
type PublicationRequest = ReturnType<typeof bulkPublicationSchema.parse>
function restoredPublication(raw: string | null): PublicationRequest | undefined {
  if (!raw) return
  try {
    const parsed = bulkPublicationSchema.safeParse(JSON.parse(raw))
    return parsed.success && parsed.data.requestKey ? parsed.data : undefined
  } catch {
    return
  }
}
function restoredDraftCommand(raw: string | null): DraftCommand | undefined {
  if (!raw) return
  try {
    const command: unknown = JSON.parse(raw)
    if (!command || typeof command !== 'object' || !('kind' in command) || !('input' in command))
      return
    if (command.kind !== 'edit' && command.kind !== 'undo') return
    if (!('sessionId' in command) || typeof command.sessionId !== 'string') return
    if (!command.input || typeof command.input !== 'object' || Array.isArray(command.input)) return
    const input = command.input as Record<string, unknown>
    if (typeof input.workshopDefinitionId !== 'string' || typeof input.requestKey !== 'string')
      return
    return {
      kind: command.kind,
      sessionId: command.sessionId,
      input: {
        ...input,
        workshopDefinitionId: input.workshopDefinitionId,
        requestKey: input.requestKey,
      },
    }
  } catch {
    return
  }
}

export type WorkspaceRow = {
  workshopDefinitionId?: string
  definitionTitle?: string
  id: string
  version: number
  name: string
  school: string
  date: string
  status: WorkshopStatus
  locked: boolean
  minPAs: number
  maxPAs: number
  visible: boolean
  problems: string[]
  assignments: {
    id: string
    name: string
    availabilityWarnings: string[]
    warnings: { code: 'SAME_DAY' | 'SAME_WEEK'; message: string }[]
  }[]
  candidates: {
    id: string
    name: string
    hardErrors: string[]
    availabilityWarnings: string[]
    warnings: {
      code: 'SAME_DAY' | 'SAME_WEEK'
      message: string
      commitments: string[]
    }[]
    totalAssignments: number
    expectedPolicyHash: string
  }[]
}
export function WorkspaceSchedule({
  rows,
  context,
  inputHash,
}: {
  rows: WorkspaceRow[]
  context: SchedulingContext
  inputHash: string
}) {
  const router = useRouter()
  const [refreshing, startTransition] = useTransition()
  const [staffId, setStaffId] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [review, setReview] = useState(false)
  const [publishedIds, setPublishedIds] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<{
    error?: string
    success?: string
    operationId?: string
  }>({})
  const [notice, setNotice] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const reviewSnapshot = useRef<PublicationRequest | null>(null)
  const displayRows = rows.map((row) =>
    publishedIds.has(row.id) && row.status === 'DRAFT'
      ? {
          ...row,
          status: 'PUBLISHED' as const,
          visible: !context.view || context.view === 'all' || context.view === 'published',
        }
      : row
  )
  const staff = displayRows.find((r) => r.id === staffId)
  const chosen = displayRows.filter((r) => selected.includes(r.id) && r.status === 'DRAFT')
  const ready = displayRows.filter((r) => r.visible && r.status === 'DRAFT' && !r.problems.length)
  function restoreFocus() {
    const target = trigger.current
    if (target?.isConnected && !target.matches(':disabled')) target.focus()
    else heading.current?.focus()
  }
  const draftCommand = useSavedCommand<DraftCommand>({
    storageKey: pendingDraftKey,
    restore: restoredDraftCommand,
    execute: (command) =>
      command.kind === 'edit' ? editDraftTeam(command.input) : undoDraftTeam(command.input),
    onRestore: (command) => setStaffId(command.sessionId),
    onStart: () => setMessage({}),
    onResult: (result) => {
      setMessage({ error: result.error, success: result.message, operationId: result.operationId })
      router.refresh()
    },
    onUncertain: () =>
      setMessage({ error: 'We could not confirm the save. Check it before continuing.' }),
  })
  const { uncertain, send: sendDraftCommand } = draftCommand
  const publication = useSavedCommand<PublicationRequest>({
    storageKey: 'calendar-publication-command',
    restore: restoredPublication,
    execute: async (request) => {
      const result = await publishSelectedDrafts(request)
      return { error: result.error, message: result.success }
    },
    onRestore: (request) => {
      reviewSnapshot.current = request
      setSelected(request.entries.map((entry) => entry.id))
      setReview(true)
    },
    onStart: () => setMessage({}),
    onResult: (result, request) => {
      if (result.error) {
        setMessage({ error: result.error })
        return
      }
      setPublishedIds(
        (current) => new Set([...current, ...request.entries.map((entry) => entry.id)])
      )
      setNotice(result.message ?? 'Sessions published.')
      setSelected([])
      setReview(false)
      dialog.current?.close()
      heading.current?.focus()
      router.refresh()
    },
    onUncertain: () =>
      setMessage({ error: 'We could not confirm publication. Check your last save to continue.' }),
  })
  const pending = refreshing || publication.pending || draftCommand.pending
  const blocked = pending || draftCommand.blocked || publication.blocked
  useSaveNavigationGuard(blocked)
  useEffect(() => {
    if (staffId || review) dialog.current?.showModal()
    else dialog.current?.close()
  }, [staffId, review])
  useEffect(() => {
    setPublishedIds((current) => {
      const pending = new Set(
        [...current].filter((id) => rows.some((row) => row.id === id && row.status === 'DRAFT'))
      )
      return pending.size === current.size ? current : pending
    })
  }, [rows])
  function close() {
    if (blocked) return
    dialog.current?.close()
    setStaffId(null)
    setReview(false)
    setMessage({})
    restoreFocus()
  }
  function staffing(
    paId: string,
    operation: 'assign' | 'remove',
    policy: Record<string, string> = {}
  ) {
    if (!staff?.workshopDefinitionId || blocked) return
    sendDraftCommand({
      kind: 'edit',
      sessionId: staff.id,
      input: {
        workshopDefinitionId: staff.workshopDefinitionId,
        sessionId: staff.id,
        version: staff.version,
        paId,
        operation,
        ...policy,
        requestKey: crypto.randomUUID(),
      },
    })
  }
  function undoLastStaffing() {
    if (blocked || !staff?.workshopDefinitionId || !message.operationId) return
    sendDraftCommand({
      kind: 'undo',
      sessionId: staff.id,
      input: {
        workshopDefinitionId: staff.workshopDefinitionId,
        operationId: message.operationId,
        requestKey: crypto.randomUUID(),
      },
    })
  }
  function publish() {
    if (blocked) return
    const request = reviewSnapshot.current
    if (!request) return
    publication.send(request)
  }
  return (
    <section
      aria-label={context.workshopDefinitionId ? 'Workshop schedule' : 'Monthly schedule'}
      className="rounded-xl border border-slate-200 bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <h2 ref={heading} tabIndex={-1} className="font-semibold">
          {context.workshopDefinitionId ? 'Workshop schedule' : 'Monthly schedule'}{' '}
          <span className="text-sm font-normal text-slate-500">
            · {displayRows.filter((r) => r.visible).length} teacher sessions
          </span>
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={blocked || !ready.length}
            onClick={() => setSelected(ready.slice(0, 200).map((r) => r.id))}
          >
            Select ready drafts
          </Button>
          {chosen.length > 0 && (
            <Button variant="ghost" size="sm" disabled={blocked} onClick={() => setSelected([])}>
              Clear selection
            </Button>
          )}
          <Button
            variant="secondary"
            disabled={blocked || !chosen.length}
            onClick={(e) => {
              trigger.current = e.currentTarget
              reviewSnapshot.current = {
                requestKey: crypto.randomUUID(),
                entries: chosen.map((r) => ({ id: r.id, version: r.version })),
                inputHash,
                scope: context.workshopDefinitionId
                  ? { workshopDefinitionId: context.workshopDefinitionId }
                  : {
                      month: context.month,
                      classSectionIds: context.classSectionId
                        ? [context.classSectionId]
                        : undefined,
                    },
              }
              setReview(true)
              setMessage({})
            }}
          >
            Review publication ({chosen.length})
          </Button>
        </div>
      </div>
      {notice && (
        <p role="status" className="m-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </p>
      )}
      <ScheduleTable
        displayRows={displayRows}
        context={context}
        selected={selected}
        blocked={blocked}
        onSelect={(id, checked) =>
          setSelected((current) =>
            checked ? [...current, id] : current.filter((item) => item !== id)
          )
        }
        onStaff={(id, button) => {
          trigger.current = button
          setStaffId(id)
          setMessage({})
        }}
      />
      <dialog
        ref={dialog}
        aria-labelledby="workspace-dialog-title"
        onCancel={(e) => {
          e.preventDefault()
          close()
        }}
        onClose={() => {
          setStaffId(null)
          setReview(false)
          restoreFocus()
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Tab') return
          const controls = [
            ...e.currentTarget.querySelectorAll<HTMLElement>(
              'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary'
            ),
          ].filter((el) => el.getClientRects().length)
          const first = controls[0],
            last = controls.at(-1)
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault()
            last?.focus()
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault()
            first?.focus()
          }
        }}
        className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-xl border-0 bg-white p-0 shadow-xl backdrop:bg-slate-950/40"
      >
        <div className="flex min-h-full flex-col">
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white p-5">
            <h2 id="workspace-dialog-title" className="text-lg font-semibold">
              {review ? 'Review publication' : 'Staff ' + (staff?.name ?? 'workshop')}
            </h2>
            <Button variant="ghost" onClick={close} disabled={blocked}>
              Close
            </Button>
          </div>
          <div className="space-y-4 p-5">
            {message.error && (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
                {message.error}{' '}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={blocked}
                  onClick={() => {
                    close()
                    startTransition(() => router.refresh())
                  }}
                >
                  Reload schedule
                </Button>
              </p>
            )}
            {uncertain && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                <p>An earlier draft save needs to be checked before another edit or publication.</p>
                <Button
                  className="mt-2"
                  disabled={pending}
                  onClick={() => sendDraftCommand(uncertain)}
                >
                  Retry and check save
                </Button>
              </div>
            )}
            {publication.uncertain && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                <p>Check whether your selected sessions were published before continuing.</p>
                <Button
                  className="mt-2"
                  disabled={pending}
                  onClick={() => publication.send(publication.uncertain!)}
                >
                  Retry and check publication
                </Button>
              </div>
            )}
            {message.success && (
              <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
                {message.success}
              </p>
            )}
            {message.operationId && staff?.workshopDefinitionId && (
              <Button variant="secondary" disabled={blocked} onClick={undoLastStaffing}>
                Undo last staffing change
              </Button>
            )}
            {staff?.workshopDefinitionId && (
              <Link
                className="text-sm underline"
                href={`/admin/workshop-definitions/${staff.workshopDefinitionId}?step=staff&sessionId=${staff.id}`}
              >
                Open saved draft and recent changes
              </Link>
            )}
            {staffId && !staff && (
              <p role="status">
                This workshop is no longer in this view. Close the panel and review the updated
                schedule.
              </p>
            )}
            {staff && !review && (
              <>
                <p className="text-sm text-slate-600">
                  {staff.school} · {staff.date}
                </p>
                <Link
                  href={schedulingHref('/admin/workshops/' + staff.id, context)}
                  className="text-sm underline"
                >
                  Workshop details and changes
                </Link>
                <h3 className="font-semibold">
                  Assigned PAs ({staff.assignments.length}/{staff.minPAs}–{staff.maxPAs})
                </h3>
                {staff.assignments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
                  >
                    <div>
                      <p>{a.name}</p>
                      <PAWarnings
                        availabilityWarnings={a.availabilityWarnings}
                        warnings={a.warnings}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={blocked}
                      onClick={() => staffing(a.id, 'remove')}
                    >
                      Remove {a.name}
                    </Button>
                  </div>
                ))}
                {staff.problems.length > 0 && (
                  <StaffingDetails
                    summary={
                      staff.problems.includes('Minimum staffing is not met.')
                        ? 'Minimum staffing is not met.'
                        : staff.problems[0]
                    }
                  >
                    {staff.problems.includes('Minimum staffing is not met.') && (
                      <p>
                        {staff.assignments.length} assigned; at least {staff.minPAs} required.
                      </p>
                    )}
                    {staff.problems.some(
                      (problem) => problem !== 'Minimum staffing is not met.'
                    ) && (
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {staff.problems
                          .filter((problem) => problem !== 'Minimum staffing is not met.')
                          .map((problem) => (
                            <li key={problem}>{problem}</li>
                          ))}
                      </ul>
                    )}
                  </StaffingDetails>
                )}
                <h3 className="font-semibold">Recommended PAs</h3>
                {staff.candidates
                  .filter(
                    (c) =>
                      !c.hardErrors.length && !c.warnings.length && !c.availabilityWarnings.length
                  )
                  .sort(
                    (a, b) => a.totalAssignments - b.totalAssignments || a.id.localeCompare(b.id)
                  )
                  .map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
                    >
                      <div>
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-slate-600">Available for the full workshop</p>
                      </div>
                      <Button
                        size="sm"
                        disabled={blocked}
                        onClick={() =>
                          staffing(c.id, 'assign', {
                            expectedPolicyHash: c.expectedPolicyHash,
                          })
                        }
                      >
                        Assign {c.name}
                      </Button>
                    </div>
                  ))}
                {!staff.candidates.some(
                  (c) =>
                    !c.hardErrors.length && !c.warnings.length && !c.availabilityWarnings.length
                ) && <p className="text-sm text-slate-600">No PAs meet every automatic rule.</p>}
                {staff.candidates.some(
                  (c) => !c.hardErrors.length && !c.warnings.length && c.availabilityWarnings.length
                ) && <h3 className="font-semibold">Other PAs</h3>}
                {staff.candidates
                  .filter(
                    (c) =>
                      !c.hardErrors.length && !c.warnings.length && c.availabilityWarnings.length
                  )
                  .sort(
                    (a, b) => a.totalAssignments - b.totalAssignments || a.id.localeCompare(b.id)
                  )
                  .map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3"
                    >
                      <div>
                        <p className="font-medium">{c.name}</p>
                        <PAWarnings availabilityWarnings={c.availabilityWarnings} />
                        <PAHistory totalAssignments={c.totalAssignments} />
                      </div>
                      <Button
                        size="sm"
                        disabled={blocked}
                        onClick={() =>
                          staffing(c.id, 'assign', {
                            expectedPolicyHash: c.expectedPolicyHash,
                          })
                        }
                      >
                        Assign {c.name}
                      </Button>
                    </div>
                  ))}
                {staff.candidates
                  .filter((c) => !c.hardErrors.length && c.warnings.length)
                  .sort(
                    (a, b) => a.totalAssignments - b.totalAssignments || a.id.localeCompare(b.id)
                  )
                  .map((c) => {
                    return (
                      <OverrideCandidate
                        key={`${staff.id}:${c.id}:${c.expectedPolicyHash}`}
                        name={c.name}
                        totalAssignments={c.totalAssignments}
                        warnings={c.warnings}
                        availabilityWarnings={c.availabilityWarnings}
                      >
                        <Button
                          size="sm"
                          disabled={blocked}
                          onClick={() =>
                            staffing(c.id, 'assign', { expectedPolicyHash: c.expectedPolicyHash })
                          }
                        >
                          Assign {c.name}
                        </Button>
                      </OverrideCandidate>
                    )
                  })}
                <details>
                  <summary className="cursor-pointer text-sm font-semibold">
                    Blocked PAs ({staff.candidates.filter((c) => c.hardErrors.length).length})
                  </summary>
                  <ul className="mt-3 space-y-3">
                    {staff.candidates
                      .filter((c) => c.hardErrors.length)
                      .map((c) => (
                        <li key={c.id} className="rounded-lg bg-slate-50 p-3">
                          <p className="font-medium">{c.name}</p>
                          <p className="text-sm text-slate-600">{c.hardErrors.join(' ')}</p>
                          <PAWarnings availabilityWarnings={c.availabilityWarnings} />
                        </li>
                      ))}
                  </ul>
                </details>
                <p className="text-xs text-slate-600">
                  PAs update their own recurring availability. Dates and published changes stay
                  under admin control.
                </p>
              </>
            )}
            {review && (
              <>
                <p className="text-sm text-slate-600">
                  Publishing makes these teacher sessions official and visible to the assigned PAs
                  and each school’s teachers. No email is sent. Contact the school and assigned PAs,
                  then record communication for this change. All selected sessions are saved
                  together.
                </p>
                {chosen.map((row) => (
                  <article
                    key={row.id}
                    className="space-y-2 rounded-lg border border-slate-200 p-3"
                  >
                    <h3 className="font-semibold">
                      {row.name} · {row.school}
                    </h3>
                    <p className="text-sm">{row.date}</p>
                    <p className="text-sm">
                      {row.assignments.map((a) => a.name).join(', ') || 'No PAs assigned'}
                    </p>
                    {row.assignments.map((assignment) => (
                      <PAWarnings
                        key={assignment.id}
                        name={assignment.name}
                        availabilityWarnings={assignment.availabilityWarnings}
                        warnings={assignment.warnings}
                      />
                    ))}
                    {row.problems.length > 0 ? (
                      <StaffingDetails
                        tone="danger"
                        summary={
                          row.problems.includes('Minimum staffing is not met.')
                            ? 'Minimum staffing is not met.'
                            : row.problems[0]
                        }
                      >
                        <ul className="list-disc pl-5">
                          {row.problems.map((problem) => (
                            <li key={problem}>{problem}</li>
                          ))}
                        </ul>
                      </StaffingDetails>
                    ) : (
                      <p className="text-sm text-emerald-800">Ready to publish</p>
                    )}
                  </article>
                ))}
                <Button
                  disabled={blocked || !chosen.length || chosen.some((r) => r.problems.length > 0)}
                  onClick={publish}
                >
                  {pending ? 'Publishing…' : 'Publish selected teacher sessions'}
                </Button>
                {chosen.some((r) => r.problems.length > 0) && (
                  <p className="text-sm text-red-800">
                    Resolve the listed problems or close this review and deselect blocked workshops.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </dialog>
    </section>
  )
}
