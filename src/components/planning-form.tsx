'use client'

import Link from 'next/link'
import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, CircleX } from 'lucide-react'
import { ReadyFields } from './ready-fields'
import { SubmitButton } from './submit-button'
import { StaffingDetails } from './staffing-details'
import {
  restorePlanningDraft,
  type PlanningChoice,
  type PlanningDraft,
} from '@/lib/schemas/planning-draft'
import {
  createWorkshopBatchForm,
  previewWorkshopBatchForm,
  type PlanningPreviewState,
} from '@/app/admin/workshops/plan/actions'

type CandidatePA = { id: string; name: string; totalAssignments: number; reasons: string[] }
type PlanningCandidate = {
  id: string
  date: string
  startTime: string
  endTime: string
  label: string
  recommended: CandidatePA[]
  warnings: CandidatePA[]
  blocked: CandidatePA[]
}

export type PlanningRow = {
  id: string
  classSectionId: string
  className: string
  schoolName: string
  label: string
  durationMinutes: number
  minPAs: number
  maxPAs: number
  candidates: PlanningCandidate[]
}

export function PlanningForm({
  requestKey,
  workshopDefinitionId,
  expectedDefinitionRevision,
  rows,
  storageKey,
  focusedClassId,
  viewStart,
  viewEnd,
}: {
  requestKey: string
  workshopDefinitionId: string
  expectedDefinitionRevision: number
  rows: PlanningRow[]
  storageKey: string
  focusedClassId?: string
  viewStart: string
  viewEnd: string
}) {
  const [state, action, pending] = useActionState(createWorkshopBatchForm, {})
  const [preview, setPreview] = useState<PlanningPreviewState>({})
  const [previewPending, setPreviewPending] = useState(false)
  const [retryCheck, setRetryCheck] = useState(0)
  const [draft, setDraft] = useState<PlanningDraft>({
    selected: {},
    mode: 'IN_PERSON',
    location: '',
    participantInstructions: '',
    notes: '',
  })
  const [restored, setRestored] = useState(false)
  const [storageWarning, setStorageWarning] = useState(false)
  const selected = draft.selected
  const [selectionVersion, setSelectionVersion] = useState(0)
  const [previewVersion, setPreviewVersion] = useState<number | null>(null)
  const revisionRef = useRef(0)
  const checkRequestRef = useRef(0)
  const formRef = useRef<HTMLFormElement>(null)
  const saveBarRef = useRef<HTMLElement>(null)
  const selectedCount = useMemo(() => Object.values(selected).filter(Boolean).length, [selected])
  const previewCurrent = previewVersion === selectionVersion
  useEffect(() => {
    // Let the saved state commit before opening the batch. Rendering the new
    // schedule must not keep the completed mutation in its pending state.
    if (state.destination) {
      try {
        sessionStorage.removeItem(storageKey)
      } catch {
        /* Saved server state is authoritative. */
      }
      window.location.replace(state.destination)
    }
  }, [state.destination, storageKey])
  useEffect(() => {
    try {
      const saved = restorePlanningDraft(
        sessionStorage.getItem(storageKey),
        rows.map((row) => row.id)
      )
      if (saved) setDraft(saved)
    } catch {
      setStorageWarning(true)
    }
    setRestored(true)
    if (focusedClassId) document.getElementById(`planning-class-${focusedClassId}`)?.focus()
  }, [storageKey, rows, focusedClassId])
  function updateDraft(next: PlanningDraft) {
    revisionRef.current += 1
    setDraft(next)
    setSelectionVersion(revisionRef.current)
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      setStorageWarning(true)
    }
  }
  function choose(rowId: string, choice?: PlanningChoice) {
    const next = { ...selected }
    if (choice)
      next[rowId] = {
        id: choice.id,
        date: choice.date,
        startTime: choice.startTime,
        label: choice.label,
      }
    else delete next[rowId]
    updateDraft({ ...draft, selected: next })
  }
  useEffect(() => {
    const form = formRef.current
    const preserveSelections = (event: Event) => event.preventDefault()
    form?.addEventListener('reset', preserveSelections)
    return () => form?.removeEventListener('reset', preserveSelections)
  }, [])
  useEffect(() => {
    const revision = selectionVersion
    const request = ++checkRequestRef.current
    let cancelled = false
    let deadline: ReturnType<typeof setTimeout> | undefined
    const current = () =>
      !cancelled && request === checkRequestRef.current && revision === revisionRef.current
    if (!restored || !selectedCount || pending || state.destination) {
      setPreviewPending(false)
      return
    }
    setPreviewPending(true)
    const debounce = setTimeout(() => {
      if (!current() || !formRef.current) return
      deadline = setTimeout(() => {
        if (!current()) return
        setPreview({ error: 'The staffing check took too long. Retry when you are ready.' })
        setPreviewVersion(revision)
        setPreviewPending(false)
        cancelled = true
      }, 30_000)
      void previewWorkshopBatchForm({}, new FormData(formRef.current))
        .then((result) => {
          if (!current()) return
          setPreview(result)
          setPreviewVersion(revision)
          setPreviewPending(false)
        })
        .catch(() => {
          if (!current()) return
          setPreview({
            error: 'The staffing check could not finish. Your date choices are unchanged.',
          })
          setPreviewVersion(revision)
          setPreviewPending(false)
        })
        .finally(() => {
          if (deadline) clearTimeout(deadline)
        })
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(debounce)
      if (deadline) clearTimeout(deadline)
    }
  }, [restored, selectedCount, selectionVersion, retryCheck, pending, state.destination])
  return (
    <form
      action={action}
      ref={formRef}
      className="space-y-4"
      onFocusCapture={(event) => {
        const focused = event.target
        // Native focus scrolling does not account for an overlapping sticky footer.
        requestAnimationFrame(() => {
          const bar = saveBarRef.current
          if (!bar || document.activeElement !== focused || bar.contains(focused)) return
          const controlBounds = focused.getBoundingClientRect()
          const barBounds = bar.getBoundingClientRect()
          if (
            barBounds.top < window.innerHeight &&
            controlBounds.bottom > barBounds.top &&
            controlBounds.top < barBounds.bottom
          ) {
            window.scrollBy({ top: controlBounds.bottom - barBounds.top + 12, behavior: 'instant' })
          }
        })
      }}
    >
      <ReadyFields disabled={!restored || pending || Boolean(state.destination)}>
        <input type="hidden" name="requestKey" value={requestKey} />
        <input type="hidden" name="workshopDefinitionId" value={workshopDefinitionId} />
        <input type="hidden" name="expectedDefinitionRevision" value={expectedDefinitionRevision} />
        <input type="hidden" name="returnWeek" value={viewStart} />
        {focusedClassId && (
          <input type="hidden" name="returnClassSectionId" value={focusedClassId} />
        )}
        {storageWarning && (
          <p role="alert" className="text-sm text-amber-950">
            This browser could not retain your choices. Save these dates before changing weeks or
            opening availability.
          </p>
        )}
        {selectedCount > 0 && (
          <section aria-label="Selected teacher dates" className="text-sm">
            <details>
              <summary className="cursor-pointer text-sm underline">
                <span>
                  {selectedCount} teacher date{selectedCount === 1 ? '' : 's'} selected across this
                  workshop
                </span>{' '}
                · Review
              </summary>
              <p className="mt-2 text-xs text-slate-600">
                Selections are kept in this tab as you browse weeks. They are not saved until you
                press Save dates.
              </p>
              {rows
                .filter((row) => selected[row.id])
                .map((row) => (
                  <p className="mt-2 text-sm" key={row.id}>
                    {row.label} · {selected[row.id].label}
                    {selected[row.id].date < viewStart || selected[row.id].date > viewEnd
                      ? ' · outside this week’s view'
                      : ''}{' '}
                    <button type="button" className="underline" onClick={() => choose(row.id)}>
                      Remove choice for {row.label}
                    </button>
                  </p>
                ))}
            </details>
          </section>
        )}
        {state.error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {state.error} Your selections are still shown.
          </p>
        )}
        {rows.map((row) => {
          const chosen = selected[row.id]
          const candidate = row.candidates.find((item) => item.id === chosen?.id)
          return (
            <article
              key={row.id}
              id={`planning-class-${row.classSectionId}`}
              tabIndex={-1}
              className={`scroll-mb-44 rounded-xl border bg-white p-4 ${focusedClassId === row.classSectionId ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'}`}
            >
              {chosen && (
                <>
                  <input type="hidden" name="classWorkshopId" value={row.id} />
                  <input type="hidden" name="date" value={chosen.date} />
                  <input type="hidden" name="startTime" value={chosen.startTime} />
                </>
              )}
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h4 className="font-semibold">{row.className}</h4>
                  <p className="mt-1 text-sm text-slate-600">{row.schoolName}</p>
                  <p className="text-xs text-slate-600">
                    {row.durationMinutes} minutes · needs {row.minPAs} PA
                    {row.minPAs === 1 ? '' : 's'}
                  </p>
                </div>
                <Link
                  href={`/admin/classes/${row.classSectionId}?workshopDefinitionId=${encodeURIComponent(workshopDefinitionId)}&week=${viewStart}&classSectionId=${encodeURIComponent(row.classSectionId)}`}
                  className="text-xs underline"
                >
                  Edit teacher availability
                </Link>
              </div>
              {row.candidates.length || chosen ? (
                <>
                  <label className="field mt-3">
                    Date and time
                    <select
                      aria-label={`${row.label} date and time`}
                      className="input"
                      value={chosen?.id ?? ''}
                      onChange={(event) => {
                        const value = event.target.value
                        choose(
                          row.id,
                          row.candidates.find((item) => item.id === value)
                        )
                      }}
                    >
                      <option value="">Choose a date and time…</option>
                      {chosen && !candidate && (
                        <option value={chosen.id}>
                          {chosen.label} · retained choice from another week
                        </option>
                      )}
                      {row.candidates.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {chosen && (
                    <p className="mt-2 text-xs font-medium text-blue-800">Selected · not saved</p>
                  )}
                  {candidate && (
                    <details className="mt-3 text-xs text-slate-600">
                      <summary className="cursor-pointer font-medium">
                        Individual slot staffing estimate
                      </summary>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <CandidatePool
                          title={`${candidate.recommended.length} recommended`}
                          tone="ready"
                          candidates={candidate.recommended}
                        />
                        <CandidatePool
                          title={`${candidate.warnings.length} available with warnings`}
                          tone="warning"
                          candidates={candidate.warnings}
                        />
                        <CandidatePool
                          title={`${candidate.blocked.length} unavailable to auto-fill`}
                          tone="blocked"
                          candidates={candidate.blocked}
                        />
                      </div>
                    </details>
                  )}
                </>
              ) : (
                <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
                  No suitable {row.durationMinutes}-minute times in this week. Browse another week,
                  add teacher availability, or choose another week.
                </p>
              )}
            </article>
          )
        })}
        <details className="rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer font-semibold">Session details (optional)</summary>
          <p className="mt-2 text-sm text-slate-600">
            These details apply to all selected teacher dates and can be edited later.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="mode" value="IN_PERSON" />
            <label className="field">
              Location (optional)
              <input
                className="input"
                name="location"
                maxLength={500}
                value={draft.location}
                onChange={(event) => updateDraft({ ...draft, location: event.target.value })}
              />
            </label>
          </div>
          <label className="field mt-3">
            Participant instructions (optional)
            <textarea
              className="input min-h-24"
              name="participantInstructions"
              maxLength={5000}
              value={draft.participantInstructions}
              onChange={(event) =>
                updateDraft({ ...draft, participantInstructions: event.target.value })
              }
            />
          </label>
          <label className="field mt-3">
            Internal notes (optional)
            <textarea
              className="input min-h-24"
              name="notes"
              maxLength={5000}
              value={draft.notes}
              onChange={(event) => updateDraft({ ...draft, notes: event.target.value })}
            />
          </label>
        </details>
        {selectedCount > 0 && (
          <section
            aria-label="Staffing check"
            className="rounded-xl border border-slate-200 bg-slate-50 p-4"
          >
            <p
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 text-sm font-semibold"
            >
              {previewPending ? (
                'Checking staffing…'
              ) : previewCurrent && preview.status === 'READY' ? (
                <>
                  <CheckCircle2 className="size-4 text-emerald-700" /> Staffing looks feasible
                </>
              ) : previewCurrent && preview.status ? (
                <>
                  <AlertTriangle className="size-4 text-amber-800" /> Automatic staffing has a
                  shortfall
                </>
              ) : (
                'Staffing not checked'
              )}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Read-only estimate for the selected dates. PAs are added in Staff; staffing does not
              prevent saving valid dates.
            </p>
            {previewCurrent && preview.error && (
              <p role="alert" className="mt-2 text-sm text-amber-900">
                {preview.error}
              </p>
            )}
            {previewCurrent && preview.rows && !previewPending && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer font-semibold">Staffing check details</summary>
                {preview.status === 'READY' ? (
                  <ul className="mt-2 list-disc space-y-2 pl-5">
                    {preview.rows.map((row) => (
                      <li key={row.classWorkshopId}>
                        {rows.find((item) => item.id === row.classWorkshopId)?.label ??
                          'Selected teacher'}{' '}
                        · {row.sessionLabel} · minimum {row.required} can be staffed.
                        {row.automaticBackups === 0
                          ? ' Limited backup coverage: no other eligible PA is available.'
                          : ' Additional eligible PAs are available.'}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-2 space-y-2">
                    <p>
                      Automatic staffing cannot meet every minimum for these fixed dates and current
                      commitments.
                    </p>
                    {preview.manualPlan && (
                      <p>
                        A manual arrangement is available with{' '}
                        {preview.manualPlan.kind === 'SAME_DAY' ? 'same-day and weekly' : 'weekly'}{' '}
                        workload warnings. You can add PAs directly in Staff; this check saves no
                        assignments.
                      </p>
                    )}
                    {preview.manualSearchBudgetReached && (
                      <p>
                        The additional manual-arrangement search ended early. This is not proof that
                        no manual arrangement exists.
                      </p>
                    )}
                    <PlanningStaffingDetails previewRows={preview.rows} rows={rows} />
                  </div>
                )}
              </details>
            )}
            {selectedCount > 0 && !previewPending && (
              <button
                type="button"
                className="mt-3 text-sm font-semibold underline"
                onClick={() => setRetryCheck((value) => value + 1)}
              >
                {previewCurrent && preview.error
                  ? 'Retry staffing check'
                  : 'Refresh staffing check'}
              </button>
            )}
          </section>
        )}
        <section
          aria-label="Save teacher dates"
          ref={saveBarRef}
          className="sticky bottom-3 z-20 rounded-xl border border-slate-300 bg-white p-4 shadow-lg"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold" role="status" aria-live="polite">
                {state.destination
                  ? 'Dates saved'
                  : pending
                    ? 'Saving dates…'
                    : selectedCount
                      ? `${selectedCount} date${selectedCount === 1 ? '' : 's'} selected · not saved`
                      : 'Choose a date above to get started'}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Save privately, then add PAs in Staff. Nothing is published yet.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <SubmitButton
                name="destination"
                value="staff"
                pendingLabel="Saving dates…"
                disabled={!selectedCount || Boolean(state.destination)}
              >
                {state.destination ? 'Opening saved sessions…' : 'Save dates & continue'}
              </SubmitButton>
              <SubmitButton
                name="destination"
                value="plan"
                variant="secondary"
                pendingLabel="Saving dates…"
                disabled={!selectedCount || Boolean(state.destination)}
              >
                Save dates
              </SubmitButton>
            </div>
          </div>
        </section>
      </ReadyFields>
      {state.destination && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          Dates saved. Opening the workshop…{' '}
          <a href={state.destination} className="font-semibold underline">
            Continue
          </a>
        </p>
      )}
    </form>
  )
}

function PlanningStaffingDetails({
  previewRows,
  rows,
}: {
  previewRows: PlanningPreviewState['rows']
  rows: PlanningRow[]
}) {
  return previewRows
    ?.filter((row) => row.reasons.length > 0)
    .map((row) => (
      <StaffingDetails
        key={row.classWorkshopId}
        summary={
          <>
            {row.assigned < row.required ? 'Minimum staffing is not met' : 'Staffing review'}
            {' · '}
            {rows.find((item) => item.id === row.classWorkshopId)?.label ?? 'Selected teacher'}
          </>
        }
      >
        <p>{row.sessionLabel}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {row.reasons.map((reason, index) => (
            <li key={`${reason}:${index}`}>{reason}</li>
          ))}
        </ul>
      </StaffingDetails>
    ))
}

function CandidatePool({
  title,
  tone,
  candidates,
}: {
  title: string
  tone: 'ready' | 'warning' | 'blocked'
  candidates: CandidatePA[]
}) {
  const colors = {
    ready: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    warning: 'border-amber-200 bg-amber-50 text-amber-950',
    blocked: 'border-red-200 bg-red-50 text-red-950',
  }
  return (
    <details className={`rounded-lg border p-3 text-xs ${colors[tone]}`}>
      <summary className="cursor-pointer font-semibold">
        {tone === 'blocked' && <CircleX className="mr-1 inline size-3" />}
        {tone === 'warning' && <AlertTriangle className="mr-1 inline size-3" />}
        {title}
      </summary>
      {candidates.length ? (
        <ul className="mt-2 space-y-2">
          {candidates.map((candidate) => (
            <li key={candidate.id}>
              <strong>{candidate.name}</strong> · {candidate.totalAssignments} total assignment
              {candidate.totalAssignments === 1 ? '' : 's'}
              {candidate.reasons.length ? ` · ${candidate.reasons.join(' ')}` : ''}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2">None.</p>
      )}
    </details>
  )
}
