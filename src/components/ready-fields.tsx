'use client'
import { useEffect, useState, type ReactNode } from 'react'

// Controlled inputs must not accept edits before React can retain those edits.
export function ReadyFields({
  children,
  disabled = false,
}: {
  children: ReactNode
  disabled?: boolean
}) {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  return (
    <fieldset disabled={!ready || disabled} className="min-w-0 space-y-4">
      {children}
    </fieldset>
  )
}
