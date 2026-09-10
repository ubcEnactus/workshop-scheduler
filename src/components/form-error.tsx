import { AlertCircle } from 'lucide-react'
/**
 * Error banner for admin forms. Server Actions can't return values to a plain
 * `<form action={...}>`, so actions redirect back with `?error=<message>` and
 * the page passes that message here. Styling matches the availability grid's
 * banners so the two halves of the app look the same.
 */
export function FormError({ message }: { message?: string }) {
  if (!message) return null

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-800"
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}
