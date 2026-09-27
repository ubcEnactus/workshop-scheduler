'use client'
import Link from 'next/link'
import { createContext, useState, type ReactNode } from 'react'

export const WorkspaceBusy = createContext<(busy: boolean) => void>(() => {})
export type WorkshopStep = 'plan' | 'staff' | 'publish'

export function WorkshopWorkspaceShell({
  step,
  hrefs,
  summary,
  children,
  overviewHref,
}: {
  step: WorkshopStep
  hrefs: Record<WorkshopStep, string>
  summary: { label: string; href: string }[]
  children: ReactNode
  overviewHref?: string
}) {
  const [busy, setBusy] = useState(false)
  const descriptions = {
    plan: 'Choose dates',
    staff: 'Build the PA team',
    publish: 'Review and share',
  }
  return (
    <WorkspaceBusy.Provider value={setBusy}>
      {overviewHref && (
        <div className="flex justify-end">
          <Link
            href={overviewHref}
            aria-disabled={busy || undefined}
            onClick={(event) => {
              if (busy) event.preventDefault()
            }}
            className="text-sm font-semibold underline"
          >
            View workshop calendar
          </Link>
        </div>
      )}
      <nav
        aria-label="Workshop workflow"
        className="grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-white p-1.5"
      >
        {(['plan', 'staff', 'publish'] as const).map((item, index) => (
          <Link
            key={item}
            href={hrefs[item]}
            aria-label={`${index + 1}. ${item === 'plan' ? 'Plan' : item === 'staff' ? 'Staff' : 'Publish'}`}
            aria-current={step === item ? 'page' : undefined}
            aria-disabled={busy || undefined}
            onClick={(event) => {
              if (busy) event.preventDefault()
            }}
            className={`min-w-0 rounded-lg px-2 py-3 text-center text-sm sm:px-4 sm:text-left ${step === item ? 'bg-brand text-white' : 'text-slate-600 hover:bg-slate-50'} ${busy ? 'opacity-60' : ''}`}
          >
            <span className="font-semibold">
              {index + 1}. {item === 'plan' ? 'Plan' : item === 'staff' ? 'Staff' : 'Publish'}
            </span>
            <span
              className={`mt-1 hidden text-xs sm:block ${step === item ? 'text-slate-200' : 'text-slate-500'}`}
            >
              {descriptions[item]}
            </span>
          </Link>
        ))}
      </nav>
      <div
        className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600"
        aria-label="Workshop progress"
      >
        {summary.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            aria-disabled={busy || undefined}
            onClick={(event) => {
              if (busy) event.preventDefault()
            }}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium hover:border-slate-400 hover:text-slate-950"
          >
            {item.label}
          </Link>
        ))}
      </div>
      {children}
    </WorkspaceBusy.Provider>
  )
}
