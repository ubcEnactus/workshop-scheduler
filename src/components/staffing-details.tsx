import { AlertOctagon, AlertTriangle, CircleHelp, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

const tones: Record<
  'warning' | 'danger' | 'neutral',
  { Icon: LucideIcon; frame: string; summary: string; content: string }
> = {
  warning: {
    Icon: AlertTriangle,
    frame: 'border-amber-200 bg-amber-50',
    summary: 'text-amber-950',
    content: 'text-amber-800',
  },
  danger: {
    Icon: AlertOctagon,
    frame: 'border-red-300 bg-red-50',
    summary: 'text-red-950',
    content: 'text-red-900',
  },
  neutral: {
    Icon: CircleHelp,
    frame: 'border-slate-200 bg-white',
    summary: 'text-slate-900',
    content: 'text-slate-700',
  },
}

export function StaffingDetails({
  summary,
  children,
  tone = 'warning',
  className = '',
  contentClassName = '',
}: {
  summary: ReactNode
  children: ReactNode
  tone?: keyof typeof tones
  className?: string
  contentClassName?: string
}) {
  const style = tones[tone]
  return (
    <details className={`rounded-lg border px-3 py-2 text-sm ${style.frame} ${className}`}>
      <summary className={`cursor-pointer font-semibold ${style.summary}`}>
        <style.Icon aria-hidden="true" className="mr-2 inline size-4" />
        {summary}
        <span className="ml-2 text-xs font-medium opacity-75">Details</span>
      </summary>
      <div className={`mt-2 text-sm ${style.content} ${contentClassName}`}>{children}</div>
    </details>
  )
}
