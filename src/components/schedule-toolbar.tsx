'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
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
  function change(next: SchedulingContext) {
    startTransition(() => router.push(schedulingHref('/admin/workshops', next), { scroll: false }))
  }
  return (
    <section
      aria-label="Month and filters"
      className="rounded-xl border border-slate-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="field min-w-40 flex-1">
          Month
          <input
            key={context.month}
            type="month"
            className="input"
            defaultValue={context.month}
            onChange={(e) => {
              if (monthSchema.safeParse(e.target.value).success)
                change({ ...context, month: e.target.value })
            }}
          />
        </label>
        <label className="field min-w-40 flex-1">
          School filter
          <select
            aria-label="School filter"
            className="input"
            value={context.schoolId ?? ''}
            onChange={(e) =>
              change({
                ...context,
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
          Class filter
          <select
            aria-label="Class filter"
            className="input"
            value={context.classSectionId ?? ''}
            onChange={(e) => change({ ...context, classSectionId: e.target.value || undefined })}
          >
            <option value="">All classes</option>
            {classes
              .filter((c) => !context.schoolId || c.schoolId === context.schoolId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <Link
          href={schedulingHref('/admin/workshops', { month: context.month })}
          className={buttonClasses({ variant: 'ghost' })}
        >
          Reset filters
        </Link>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link
          scroll={false}
          href={schedulingHref('/admin/workshops', {
            ...context,
            month: shiftMonth(context.month, -1),
          })}
        >
          ← Previous month
        </Link>
        <span role={pending ? 'status' : undefined} className="text-xs text-slate-600">
          {pending ? 'Updating schedule…' : 'Vancouver time · filters apply automatically'}
        </span>
        <Link
          scroll={false}
          href={schedulingHref('/admin/workshops', {
            ...context,
            month: shiftMonth(context.month, 1),
          })}
        >
          Next month →
        </Link>
      </div>
    </section>
  )
}
