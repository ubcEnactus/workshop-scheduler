'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import type { WorkshopStatus } from '@prisma/client'
import { updateDraftStaffing, publishSelectedDrafts } from '@/app/admin/workshops/workspace-actions'
import { schedulingHref, type SchedulingContext } from '@/lib/scheduling/navigation'
import { Button } from './ui/button'
import { StatusBadge } from './ui/status-badge'

export type WorkspaceRow = {
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
  assignments: { id: string; name: string }[]
  candidates: { id: string; name: string; reasons: string[]; remaining: number | null }[]
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
  const [pending, startTransition] = useTransition()
  const [staffId, setStaffId] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [review, setReview] = useState(false)
  const [publishedIds, setPublishedIds] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<{ error?: string; success?: string }>({})
  const [notice, setNotice] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const reviewSnapshot = useRef<{
    entries: { id: string; version: number }[]
    inputHash: string
  } | null>(null)
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
    if (pending) return
    dialog.current?.close()
    setStaffId(null)
    setReview(false)
    setMessage({})
    restoreFocus()
  }
  function staffing(paId: string, operation: 'assign' | 'remove') {
    if (!staff) return
    const form = new FormData()
    for (const [key, value] of Object.entries({
      id: staff.id,
      version: String(staff.version),
      paId,
      operation,
    }))
      form.set(key, value)
    setMessage({})
    startTransition(async () => {
      try {
        setMessage(await updateDraftStaffing(form))
        router.refresh()
      } catch {
        setMessage({
          error:
            'Could not save staffing. Your schedule is unchanged in this view; reload to check the latest state before retrying.',
        })
      }
    })
  }
  function publish() {
    const request = reviewSnapshot.current
    if (!request) return
    setMessage({})
    startTransition(async () => {
      try {
        const result = await publishSelectedDrafts(request)
        if (result.error) setMessage(result)
        else {
          setPublishedIds((current) => new Set([...current, ...request.entries.map((e) => e.id)]))
          setNotice(result.success ?? 'Workshops published.')
          setSelected([])
          setReview(false)
          dialog.current?.close()
          heading.current?.focus()
          router.refresh()
        }
      } catch {
        setMessage({
          error:
            'Could not confirm publication. Reload the schedule to check its current state before retrying.',
        })
      }
    })
  }
  return (
    <section aria-label="Monthly schedule" className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <h2 ref={heading} tabIndex={-1} className="font-semibold">
          Monthly schedule{' '}
          <span className="text-sm font-normal text-slate-500">
            · {displayRows.filter((r) => r.visible).length} workshops
          </span>
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={!ready.length}
            onClick={() => setSelected(ready.slice(0, 200).map((r) => r.id))}
          >
            Select ready drafts
          </Button>
          {chosen.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
              Clear selection
            </Button>
          )}
          <Button
            variant="secondary"
            disabled={!chosen.length}
            onClick={(e) => {
              trigger.current = e.currentTarget
              reviewSnapshot.current = {
                entries: chosen.map((r) => ({ id: r.id, version: r.version })),
                inputHash,
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
      {!displayRows.some((r) => r.visible) ? (
        <div className="empty-state">
          <p>No workshops in this month for these filters.</p>
          <Link className="underline" href={schedulingHref('/admin/workshops/plan', context)}>
            Plan workshops
          </Link>
          <Link
            className="underline"
            href={schedulingHref('/admin/workshops', { month: context.month })}
          >
            Reset filters
          </Link>
        </div>
      ) : (
        <table className="block w-full border-collapse text-left text-sm md:table">
          <caption className="sr-only">Workshops for {context.month}, America/Vancouver</caption>
          <thead className="hidden bg-slate-50 text-xs text-slate-600 md:table-header-group">
            <tr>
              <th className="p-3">Publish</th>
              <th className="p-3">Class and school</th>
              <th className="p-3">Vancouver date/time</th>
              <th className="p-3">Staffing</th>
              <th className="p-3">Status</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody className="block md:table-row-group">
            {displayRows
              .filter((r) => r.visible)
              .map((row) => (
                <tr
                  key={row.id}
                  className="grid gap-2 border-t border-slate-100 p-4 md:table-row md:p-0"
                >
                  <td className="md:p-3">
                    {row.status === 'DRAFT' && (
                      <label className="flex min-h-9 items-center gap-2">
                        <input
                          type="checkbox"
                          className="size-5 accent-[#1e2a4a]"
                          aria-label={'Select ' + row.name + ' ' + row.date + ' for publication'}
                          checked={selected.includes(row.id)}
                          onChange={(e) =>
                            setSelected((current) =>
                              e.target.checked
                                ? [...current, row.id]
                                : current.filter((id) => id !== row.id)
                            )
                          }
                        />
                        <span className="text-xs md:hidden">Select for publication</span>
                      </label>
                    )}
                  </td>
                  <td className="md:p-3">
                    <Link
                      className="font-semibold underline-offset-2 hover:underline"
                      href={schedulingHref('/admin/workshops/' + row.id, context)}
                    >
                      {row.name}
                    </Link>
                    <p className="text-xs text-slate-600">{row.school}</p>
                  </td>
                  <td className="md:p-3">{row.date}</td>
                  <td className="md:p-3">
                    <p>{row.assignments.map((a) => a.name).join(', ') || 'No PAs assigned'}</p>
                    <p className="text-xs text-slate-600">
                      {row.assignments.length} / {row.minPAs}–{row.maxPAs} PAs
                    </p>
                  </td>
                  <td className="md:p-3">
                    <StatusBadge status={row.status} />
                    {row.locked && row.status === 'DRAFT' && (
                      <p className="mt-1 text-xs text-slate-600">Protected from matching</p>
                    )}
                    {row.problems.length > 0 &&
                      row.status !== 'CANCELLED' &&
                      row.status !== 'COMPLETED' && (
                        <p className="mt-1 text-xs text-amber-800">
                          {row.status === 'DRAFT' ? 'Needs staffing review' : 'Needs review'}
                        </p>
                      )}
                  </td>
                  <td className="md:p-3">
                    {row.status === 'DRAFT' ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(e) => {
                          trigger.current = e.currentTarget
                          setStaffId(row.id)
                          setMessage({})
                        }}
                      >
                        Staff {row.name}
                      </Button>
                    ) : (
                      <Link
                        className="text-sm font-semibold underline"
                        href={schedulingHref('/admin/workshops/' + row.id, context)}
                      >
                        Details
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
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
              'button:not(:disabled), a[href], input:not(:disabled), summary'
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
            <Button variant="ghost" onClick={close} disabled={pending}>
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
                  onClick={() => {
                    close()
                    router.refresh()
                  }}
                >
                  Reload schedule
                </Button>
              </p>
            )}
            {message.success && (
              <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
                {message.success}
              </p>
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
                    <span>{a.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => staffing(a.id, 'remove')}
                    >
                      Remove {a.name}
                    </Button>
                  </div>
                ))}
                {staff.problems.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">
                    {staff.problems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
                <h3 className="font-semibold">Eligible PAs</h3>
                {staff.candidates
                  .filter((c) => !c.reasons.length)
                  .map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
                    >
                      <div>
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-slate-600">
                          Available for the full workshop · {c.remaining} quota remaining
                        </p>
                      </div>
                      <Button size="sm" disabled={pending} onClick={() => staffing(c.id, 'assign')}>
                        Assign {c.name}
                      </Button>
                    </div>
                  ))}
                {!staff.candidates.some((c) => !c.reasons.length) && (
                  <p className="text-sm text-slate-600">No eligible PAs for this workshop.</p>
                )}
                <details>
                  <summary className="cursor-pointer text-sm font-semibold">
                    Unavailable PAs ({staff.candidates.filter((c) => c.reasons.length).length})
                  </summary>
                  <ul className="mt-3 space-y-3">
                    {staff.candidates
                      .filter((c) => c.reasons.length)
                      .map((c) => (
                        <li key={c.id} className="rounded-lg bg-slate-50 p-3">
                          <p className="font-medium">{c.name}</p>
                          <p className="text-sm text-slate-600">{c.reasons.join(' ')}</p>
                          {c.reasons.some((r) => r.includes('quota')) && (
                            <Link
                              href={schedulingHref('/admin/staffing', context) + '#quota-' + c.id}
                              className="text-sm underline"
                            >
                              Set {c.name}’s {context.month} quota
                            </Link>
                          )}
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
                  Publishing makes these workshops visible to the assigned PAs and each school’s
                  teachers. All selected workshops are saved together.
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
                    {row.problems.length > 0 ? (
                      <ul className="list-disc pl-5 text-sm text-red-800">
                        {row.problems.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-emerald-800">Ready to publish</p>
                    )}
                  </article>
                ))}
                <Button
                  disabled={pending || !chosen.length || chosen.some((r) => r.problems.length > 0)}
                  onClick={publish}
                >
                  {pending ? 'Publishing…' : 'Publish selected workshops'}
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
