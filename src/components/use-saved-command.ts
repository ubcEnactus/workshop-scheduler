'use client'

import { useEffect, useRef, useState, useTransition } from 'react'

export type SavedCommandResult = { error?: string; message?: string; operationId?: string }

/** Keep the original request across a lost response, including a page reload. */
export function useSavedCommand<T>({
  storageKey,
  restore,
  execute,
  onResult,
  onRestore,
  onStart,
  onUncertain,
}: {
  storageKey: string
  restore: (raw: string | null) => T | undefined
  execute: (command: T) => Promise<SavedCommandResult>
  onResult: (result: SavedCommandResult, command: T) => void
  onRestore?: (command: T) => void
  onStart?: () => void
  onUncertain?: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [uncertain, setUncertain] = useState<T>()
  const [restored, setRestored] = useState(false)
  const inFlight = useRef(false)
  const callbacks = useRef({ restore, execute, onResult, onRestore, onStart, onUncertain })
  callbacks.current = { restore, execute, onResult, onRestore, onStart, onUncertain }

  useEffect(() => {
    setRestored(false)
    setUncertain(undefined)
    try {
      const command = callbacks.current.restore(sessionStorage.getItem(storageKey))
      if (command) {
        setUncertain(command)
        callbacks.current.onRestore?.(command)
      }
    } catch {
      // The in-memory command still supports retries when storage is unavailable.
    } finally {
      setRestored(true)
    }
  }, [storageKey])

  function send(command: T) {
    if (inFlight.current || !restored || (uncertain && command !== uncertain)) return
    inFlight.current = true
    callbacks.current.onStart?.()
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(command))
    } catch {
      /* Retain in memory. */
    }
    startTransition(async () => {
      try {
        const result = await callbacks.current.execute(command)
        setUncertain(undefined)
        try {
          sessionStorage.removeItem(storageKey)
        } catch {
          /* The result is known. */
        }
        callbacks.current.onResult(result, command)
      } catch {
        setUncertain(command)
        callbacks.current.onUncertain?.()
      } finally {
        inFlight.current = false
      }
    })
  }
  return { pending, uncertain, restored, blocked: pending || !!uncertain || !restored, send }
}

export function useSaveNavigationGuard(blocked: boolean) {
  useEffect(() => {
    if (!blocked) return
    const preventLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const preventNavigation = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('a[href]')) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', preventLeave)
    document.addEventListener('click', preventNavigation, true)
    return () => {
      window.removeEventListener('beforeunload', preventLeave)
      document.removeEventListener('click', preventNavigation, true)
    }
  }, [blocked])
}
