'use client'

import { useFormStatus } from 'react-dom'

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
    >
      {pending ? 'Saving…' : children}
    </button>
  )
}
