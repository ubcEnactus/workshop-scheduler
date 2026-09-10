import type { ReactNode } from 'react'
const tones = {
  amber: 'border-amber-200 bg-amber-50 text-amber-900',
  blue: 'border-blue-200 bg-blue-50 text-blue-900',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  slate: 'border-slate-200 bg-white text-slate-900',
}
export function StatCard({
  label,
  value,
  detail,
  icon,
  tone = 'slate',
}: {
  label: string
  value: string | number
  detail?: ReactNode
  icon?: ReactNode
  tone?: keyof typeof tones
}) {
  return (
    <div className={'flex min-w-0 items-start gap-4 rounded-xl border p-5 ' + tones[tone]}>
      {icon && (
        <div
          aria-hidden="true"
          className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/70 [&_svg]:size-5"
        >
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-wider uppercase">{label}</p>
        <p className="mt-1 text-3xl leading-tight font-bold tabular-nums">{value}</p>
        {detail && <div className="mt-1 text-xs leading-relaxed">{detail}</div>}
      </div>
    </div>
  )
}
