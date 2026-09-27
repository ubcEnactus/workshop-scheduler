'use client'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { monthSchema } from '@/lib/schemas/workshops'
import { schedulingHref, type SchedulingContext } from '@/lib/scheduling/navigation'
export function ContextMonth({
  context,
  path,
  label,
}: {
  context: SchedulingContext
  path: string
  label: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <div className="flex flex-wrap items-end gap-3" aria-busy={pending}>
      <label className="field max-w-xs">
        {label}
        <input
          className="input"
          key={context.month}
          type="month"
          defaultValue={context.month}
          onChange={(e) => {
            if (monthSchema.safeParse(e.target.value).success)
              start(() =>
                router.push(schedulingHref(path, { ...context, month: e.target.value }), {
                  scroll: false,
                })
              )
          }}
        />
      </label>
      <span role="status" aria-live="polite" className="text-xs text-slate-500">
        {pending ? 'Loading month…' : ''}
      </span>
    </div>
  )
}
