'use client'

import { useFormStatus } from 'react-dom'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ComponentProps } from 'react'

export function SubmitButton({
  children,
  variant = 'primary',
  className = '',
  disabled,
  pendingLabel = 'Saving…',
  ...props
}: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus()
  return (
    <Button
      {...props}
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      variant={variant}
      className={className}
    >
      {pending && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
      {pending ? pendingLabel : children}
    </Button>
  )
}
