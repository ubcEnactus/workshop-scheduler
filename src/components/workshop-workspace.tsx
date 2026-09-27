'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useContext, useEffect, useState } from 'react'
import {
  editDraftTeam,
  autoFillDraftTeam,
  undoDraftTeam,
} from '@/app/admin/workshop-definitions/[id]/staffing-actions'
import { publishSelectedDrafts } from '@/app/admin/workshops/workspace-actions'
import type {
  DraftActivity,
  WorkshopWorkspacePA,
  WorkshopWorkspaceRow,
} from '@/lib/scheduling/workspace-view'
import { Button, buttonClasses } from './ui/button'
import { PAWarnings } from './pa-warnings'
import { DraftSessionCard } from './draft-session-card'
import { WorkspaceBusy } from './workshop-workspace-shell'
import { useSavedCommand, useSaveNavigationGuard } from './use-saved-command'
export { WorkshopWorkspaceShell, type WorkshopStep } from './workshop-workspace-shell'

type Command = { kind: 'edit' | 'fill' | 'undo' | 'publish'; input: Record<string, unknown> }
type Result = { error?: string; message?: string; operationId?: string }
function restoreCommand(raw: string | null, workshopDefinitionId: string): Command | undefined {
  if (!raw) return
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || !('kind' in value) || !('input' in value)) return
    if (
      !['edit', 'fill', 'undo', 'publish'].includes(String(value.kind)) ||
      !value.input ||
      typeof value.input !== 'object' ||
      Array.isArray(value.input)
    )
      return
    const input = value.input as Record<string, unknown>
    if (input.workshopDefinitionId !== workshopDefinitionId) return
    if (value.kind !== 'publish' && typeof input.requestKey !== 'string') return
    return { kind: value.kind as Command['kind'], input }
  } catch {
    return
  }
}

export function WorkshopDraftWorkspace({
  workshopDefinitionId,
  step,
  rows,
  operations,
  inputHash,
  focusedSessionId,
  scoped = false,
  filter,
}: {
  workshopDefinitionId: string
  step: 'staff' | 'publish'
  rows: WorkshopWorkspaceRow[]
  operations: DraftActivity[]
  inputHash: string
  focusedSessionId?: string
  scoped?: boolean
  filter?: 'needs-pas' | 'ready'
}) {
  const router = useRouter()
  const setBusy = useContext(WorkspaceBusy)
  const [message, setMessage] = useState<Result>({})
  const storageKey = `workshop-command:${workshopDefinitionId}`
  // Freeze a status-filtered view's identity, not its data: saving the last PA must
  // not unmount the row, its open editor, or the Undo affordance mid-task.
  const [filteredIds] = useState(() =>
    filter
      ? new Set(
          rows
            .filter(
              (row) =>
                row.status === 'DRAFT' &&
                (filter === 'needs-pas'
                  ? row.assignments.length < row.minPAs
                  : !row.problems.length)
            )
            .map((row) => row.id)
        )
      : undefined
  )
  const visibleRows = filteredIds ? rows.filter((row) => filteredIds.has(row.id)) : rows
  const drafts = visibleRows.filter((row) => row.status === 'DRAFT')
  const ready = drafts.filter((row) => !row.problems.length)
  const fillable = drafts.filter((row) => !row.locked && row.assignments.length < row.minPAs)
  const [selected, setSelected] = useState<string[]>(() =>
    step === 'staff' ? fillable.map((row) => row.id) : []
  )
  const selectedRows = (step === 'staff' ? fillable : ready).filter((row) =>
    selected.includes(row.id)
  )

  const { pending, uncertain, blocked, send } = useSavedCommand<Command>({
    storageKey,
    restore: (raw) => restoreCommand(raw, workshopDefinitionId),
    execute: async (command) => {
      if (command.kind === 'edit') return editDraftTeam(command.input)
      if (command.kind === 'fill') return autoFillDraftTeam(command.input)
      if (command.kind === 'undo') return undoDraftTeam(command.input)
      const result = await publishSelectedDrafts(command.input)
      return { error: result.error, message: result.success }
    },
    onStart: () => setMessage({}),
    onResult: (result, command) => {
      setMessage(command.kind === 'undo' ? { ...result, operationId: undefined } : result)
      if (!result.error && command.kind === 'publish') setSelected([])
      router.refresh()
    },
    onUncertain: () =>
      setMessage({ error: 'We could not confirm the save. Check it before continuing.' }),
  })
  useSaveNavigationGuard(blocked)
  useEffect(() => {
    setBusy(blocked)
    return () => setBusy(false)
  }, [blocked, setBusy])
  useEffect(() => {
    if (focusedSessionId)
      document.getElementById(`session-${focusedSessionId}`)?.scrollIntoView({ block: 'nearest' })
  }, [focusedSessionId])

  function edit(
    row: WorkshopWorkspaceRow,
    operation: 'assign' | 'remove' | 'keep' | 'lock' | 'unlock' | 'allow-pa',
    pa?: WorkshopWorkspacePA
  ) {
    send({
      kind: 'edit',
      input: {
        workshopDefinitionId,
        sessionId: row.id,
        version: row.version,
        operation,
        paId: pa?.id,
        expectedPolicyHash: pa?.expectedPolicyHash,
        requestKey: crypto.randomUUID(),
      },
    })
  }
  function undo(operationId: string) {
    send({
      kind: 'undo',
      input: { workshopDefinitionId, operationId, requestKey: crypto.randomUUID() },
    })
  }
  function toggle(id: string, checked: boolean) {
    setSelected((items) =>
      checked ? [...new Set([...items, id])] : items.filter((item) => item !== id)
    )
  }
  const fullHref = `/admin/workshop-definitions/${workshopDefinitionId}?step=${step}`

  return (
    <section
      aria-label={step === 'staff' ? 'Draft staffing' : 'Final publication review'}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <h2 className="text-xl font-semibold">
            {step === 'staff' ? 'Build your PA team' : 'Review & publish'}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {step === 'staff'
              ? ready.length === drafts.length && drafts.length > 0
                ? 'Your teams are ready. Review the dates and PAs before publishing.'
                : 'Start with Auto-fill, or choose PAs for each session below. Changes save automatically and stay private until published.'
              : 'Check the dates and PA teams, then select the sessions you want to share.'}
          </p>
        </div>
        {step === 'staff' && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant={ready.length > 0 && !selectedRows.length ? 'secondary' : 'primary'}
              disabled={blocked || !selectedRows.length}
              onClick={() =>
                send({
                  kind: 'fill',
                  input: {
                    workshopDefinitionId,
                    entries: selectedRows.map((row) => ({ id: row.id, version: row.version })),
                    requestKey: crypto.randomUUID(),
                  },
                })
              }
            >
              Auto-fill missing PAs ({selectedRows.length})
            </Button>
            {ready.length > 0 && (
              <Link
                href={`/admin/workshop-definitions/${workshopDefinitionId}?step=publish${scoped ? visibleRows.map((row) => `&sessionId=${encodeURIComponent(row.id)}`).join('') : ''}`}
                aria-disabled={blocked || undefined}
                className={
                  buttonClasses({ variant: selectedRows.length ? 'secondary' : 'primary' }) +
                  (blocked ? ' opacity-60' : '')
                }
              >
                Review &amp; publish ({ready.length}) →
              </Link>
            )}
          </div>
        )}
      </div>
      {scoped && (
        <p className="text-sm text-slate-600">
          Showing {visibleRows.length} selected session{visibleRows.length === 1 ? '' : 's'}.{' '}
          <Link
            aria-disabled={blocked || undefined}
            onClick={(event) => {
              if (blocked) event.preventDefault()
            }}
            href={fullHref}
            className="underline"
          >
            Show full workshop
          </Link>
        </p>
      )}
      <div role="status" aria-live="polite" className="text-sm text-emerald-900">
        {pending ? 'Saving…' : message.message}
        {message.operationId && !pending && (
          <Button
            className="ml-2"
            size="sm"
            variant="secondary"
            disabled={blocked}
            onClick={() => undo(message.operationId!)}
          >
            Undo
          </Button>
        )}
      </div>
      {message.error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
          {message.error}
        </p>
      )}
      {uncertain && !pending && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <p>Check your last save to continue. Your selections are kept.</p>
          <Button className="mt-2" size="sm" onClick={() => send(uncertain)}>
            Retry and check save
          </Button>
        </div>
      )}
      {drafts.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Button
            size="sm"
            variant="secondary"
            disabled={blocked}
            onClick={() => setSelected((step === 'staff' ? fillable : ready).map((row) => row.id))}
          >
            {step === 'staff' ? 'Select sessions needing PAs' : 'Select all ready'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={blocked || !selected.length}
            onClick={() => setSelected([])}
          >
            Clear selection
          </Button>
          <span className="text-slate-600">
            {selectedRows.length} selected ·{' '}
            {step === 'staff'
              ? `${fillable.length} need PAs with auto-fill on`
              : `${ready.length} ready to publish`}
          </span>
        </div>
      )}
      {step === 'staff' ? (
        drafts.map((row) => (
          <DraftSessionCard
            key={row.id}
            row={row}
            disabled={blocked}
            selected={selected.includes(row.id)}
            onSelect={(checked) => toggle(row.id, checked)}
            onEdit={edit}
            focused={focusedSessionId === row.id}
          />
        ))
      ) : (
        <>
          {ready.map((row) => (
            <article
              key={row.id}
              id={`session-${row.id}`}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 size-5"
                  disabled={blocked}
                  checked={selected.includes(row.id)}
                  onChange={(event) => toggle(row.id, event.target.checked)}
                  aria-label={`Publish ${row.name} ${row.date}`}
                />
                <span>
                  <strong>{row.name}</strong>
                  <span className="block text-sm text-slate-600">
                    {row.school} · {row.date}
                  </span>
                  <span className="mt-1 block text-xs font-semibold text-emerald-800">
                    Ready to publish
                  </span>
                </span>
              </label>
              <ul className="mt-3 space-y-2 pl-8">
                {row.assignments.map((pa) => (
                  <li key={pa.id}>
                    <p className="text-sm font-medium">{pa.name}</p>
                    <PAWarnings {...pa} />
                  </li>
                ))}
              </ul>
            </article>
          ))}
          {!!drafts.filter((row) => row.problems.length).length && (
            <details className="rounded-xl border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer font-semibold">
                Unfinished sessions ({drafts.length - ready.length})
              </summary>
              <ul className="mt-3 space-y-3">
                {drafts
                  .filter((row) => row.problems.length)
                  .map((row) => (
                    <li key={row.id}>
                      <Link
                        href={`/admin/workshop-definitions/${workshopDefinitionId}?step=staff&sessionId=${row.id}`}
                        className="font-medium underline"
                      >
                        {row.name} · {row.date}
                      </Link>
                      <ul className="mt-1 list-disc pl-5 text-sm text-red-900">
                        {row.problems.map((problem) => (
                          <li key={problem}>{problem}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
              </ul>
            </details>
          )}
          {!!ready.length && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="mb-3 text-sm text-emerald-950">
                Visible to assigned PAs and school teachers. No email is sent.
              </p>
              <Button
                disabled={blocked || !selectedRows.length}
                onClick={() =>
                  send({
                    kind: 'publish',
                    input: {
                      workshopDefinitionId,
                      requestKey: crypto.randomUUID(),
                      entries: selectedRows.map((row) => ({ id: row.id, version: row.version })),
                      inputHash,
                      scope: { workshopDefinitionId },
                    },
                  })
                }
              >
                Publish {selectedRows.length} session{selectedRows.length === 1 ? '' : 's'}
              </Button>
            </div>
          )}
        </>
      )}
      {!drafts.length && (
        <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          No private draft sessions in this view.{' '}
          <Link
            href={`/admin/workshop-definitions/${workshopDefinitionId}?step=plan`}
            className="underline"
          >
            Choose teacher dates
          </Link>{' '}
          or open an existing published session below.
        </p>
      )}
      {step === 'staff' && operations.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer font-semibold">Recent draft activity</summary>
          <ul className="mt-3 divide-y divide-slate-100">
            {operations.map((operation) => (
              <li
                key={operation.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="text-sm">{operation.summary}</p>
                  <p className="text-xs text-slate-500">
                    {operation.createdAt}
                    {operation.undone ? ' · Undone' : ''}
                  </p>
                </div>
                {!operation.undone && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={blocked}
                    onClick={() => undo(operation.id)}
                    aria-label={`Undo ${operation.summary}`}
                  >
                    Undo
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
