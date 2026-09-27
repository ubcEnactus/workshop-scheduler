import { LoaderCircle } from 'lucide-react'

export function RouteLoading({ label }: { label: string }) {
  return (
    <main className="page-content" aria-busy="true">
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-5 text-sm font-medium text-slate-700 shadow-sm"
      >
        <LoaderCircle aria-hidden="true" className="size-5 shrink-0 animate-spin text-amber-600" />
        Loading {label}…
      </div>
      <div aria-hidden="true" className="space-y-5">
        <div className="h-24 animate-pulse rounded-xl bg-slate-200/70" />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="h-32 animate-pulse rounded-xl bg-white" />
          <div className="h-32 animate-pulse rounded-xl bg-white" />
          <div className="h-32 animate-pulse rounded-xl bg-white" />
        </div>
        <div className="h-56 animate-pulse rounded-xl bg-white" />
      </div>
    </main>
  )
}
