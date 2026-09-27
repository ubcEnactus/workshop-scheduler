'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition, type MouseEvent } from 'react'
import { monthSchema } from '@/lib/schemas/workshops'
import { shiftMonth } from '@/lib/time'
import { schedulingHref, type SchedulingContext } from '@/lib/scheduling/navigation'
import { buttonClasses } from './ui/button'

export function ScheduleToolbar({
  context,
  schools,
  classes,
}: {
  context: SchedulingContext
  schools: { id: string; name: string }[]
  classes: { id: string; name: string; schoolId: string }[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState(context)
  const [monthInput, setMonthInput] = useState(context.month)
  const requested = useRef(context)
  useEffect(() => {
    if (!pending) {
      requested.current = context
      setDraft(context)
      setMonthInput(context.month)
    }
  }, [context, pending])
  function change(patch: Partial<SchedulingContext>) {
    const next = { ...requested.current, ...patch }
    requested.current = next
    setDraft(next)
    setMonthInput(next.month)
    startTransition(() => router.push(schedulingHref('/admin/workshops', next), { scroll: false }))
  }
  function navigate(event: MouseEvent<HTMLAnchorElement>, patch: Partial<SchedulingContext>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return
    event.preventDefault()
    change(patch)
  }
  return (
    <section
      aria-label="Month and filters"
      aria-busy={pending}
      className="rounded-xl border border-slate-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-end gap-3">
        {!context.workshopDefinitionId && (
          <label className="field min-w-40 flex-1">
            Month
            <input
              type="month"
              className="input"
              value={monthInput}
              onChange={(e) => {
                setMonthInput(e.target.value)
                if (monthSchema.safeParse(e.target.value).success) change({ month: e.target.value })
              }}
            />
          </label>
        )}
        <label className="field min-w-40 flex-1">
          School filter
          <select
            aria-label="School filter"
            className="input"
            value={draft.schoolId ?? ''}
            onChange={(e) =>
              change({
                schoolId: e.target.value || undefined,
                classSectionId: undefined,
              })
            }
          >
            <option value="">All schools</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field min-w-40 flex-1">
          Teacher filter
          <select
            aria-label="Teacher filter"
            className="input"
            value={draft.classSectionId ?? ''}
            onChange={(e) => change({ classSectionId: e.target.value || undefined })}
          >
            <option value="">All teachers</option>
            {classes
              .filter((c) => !draft.schoolId || c.schoolId === draft.schoolId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <Link
          href={schedulingHref('/admin/workshops', {
            month: draft.month,
            workshopDefinitionId: draft.workshopDefinitionId,
            batch: draft.batch,
          })}
          onClick={(event) =>
            navigate(event, { schoolId: undefined, classSectionId: undefined, view: undefined })
          }
          className={buttonClasses({ variant: 'ghost' })}
        >
          Reset filters
        </Link>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        {!context.workshopDefinitionId && (
          <Link
            scroll={false}
            href={schedulingHref('/admin/workshops', {
              ...draft,
              month: shiftMonth(draft.month, -1),
            })}
            onClick={(event) => navigate(event, { month: shiftMonth(requested.current.month, -1) })}
          >
            ← Previous month
          </Link>
        )}
        <span role="status" aria-live="polite" className="text-xs text-slate-600">
          {pending ? 'Updating schedule…' : 'Vancouver time · filters apply automatically'}
        </span>
        {!context.workshopDefinitionId && (
          <Link
            scroll={false}
            href={schedulingHref('/admin/workshops', {
              ...draft,
              month: shiftMonth(draft.month, 1),
            })}
            onClick={(event) => navigate(event, { month: shiftMonth(requested.current.month, 1) })}
          >
            Next month →
          </Link>
        )}
      </div>
    </section>
  )
}
