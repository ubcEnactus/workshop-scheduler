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
      className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
    >
      {message}
    </div>
  )
}
