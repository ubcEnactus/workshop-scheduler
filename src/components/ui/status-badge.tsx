const styles: Record<string, string> = {
  draft: 'border-slate-200 bg-slate-50 text-slate-600',
  published: 'border-blue-200 bg-blue-50 text-blue-800',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  cancelled: 'border-slate-200 bg-slate-100 text-slate-600',
  active: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  locked: 'border-amber-200 bg-amber-50 text-amber-900',
  unlocked: 'border-slate-200 bg-slate-50 text-slate-600',
  review: 'border-amber-200 bg-amber-50 text-amber-900',
  ready: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  'needs setup': 'border-amber-200 bg-amber-50 text-amber-900',
}
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const key = status.toLowerCase()
  return (
    <span
      className={
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] leading-none font-semibold whitespace-nowrap ' +
        (styles[key] ?? styles.draft)
      }
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {label ?? key}
    </span>
  )
}
