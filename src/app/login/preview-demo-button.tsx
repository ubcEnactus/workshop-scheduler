'use client'

import type { ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import { useFormStatus } from 'react-dom'

import { buttonClasses } from '@/components/ui/button'

export function PreviewDemoButton({
  ariaLabel,
  children,
}: {
  ariaLabel: string
  children: ReactNode
}) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      aria-label={ariaLabel}
      className={`${buttonClasses({ variant: 'secondary' })} min-h-12 w-full justify-between px-3 text-left`}
    >
      {pending ? (
        <span className="flex items-center gap-2">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Opening dashboard…
        </span>
      ) : (
        children
      )}
    </button>
  )
}
