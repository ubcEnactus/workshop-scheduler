'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { undoDraftTeam } from '@/app/admin/workshop-definitions/[id]/staffing-actions'

export type DraftHistoryItem = {
  id: string
  summary: string
  createdAt: string
  undoneAt: string | null
  canUndo: boolean
}
export function DraftOperationHistory({
  workshopDefinitionId,
  items,
}: {
  workshopDefinitionId: string
  items: DraftHistoryItem[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const [restored, setRestored] = useState(false)
  const retry = useRef<{ operationId: string; requestKey: string } | null>(null)
  const root = useRef<HTMLDetailsElement>(null)
  const inFlight = useRef(false)
  const storageKey = `draft-undo:${workshopDefinitionId}`
  const blocked = pending || uncertain || !restored
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey)
      const value: unknown = raw ? JSON.parse(raw) : undefined
      if (
        value &&
        typeof value === 'object' &&
        'operationId' in value &&
        'requestKey' in value &&
        typeof value.operationId === 'string' &&
        typeof value.requestKey === 'string'
      ) {
        retry.current = { operationId: value.operationId, requestKey: value.requestKey }
        setUncertain(true)
        setMessage('An earlier Undo needs to be checked before another change or publication.')
      }
    } catch {
      /* The current request remains available in memory. */
    } finally {
      setRestored(true)
    }
  }, [storageKey])
  useEffect(() => {
    if (!blocked) return
    const preventLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const preventOtherAction = (event: Event) => {
      if (
        event.type === 'submit' ||
        (event.target instanceof Element &&
          !root.current?.contains(event.target) &&
          event.target.closest('a[href], button, input[type="submit"]'))
      ) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', preventLeave)
    document.addEventListener('click', preventOtherAction, true)
    document.addEventListener('submit', preventOtherAction, true)
    return () => {
      window.removeEventListener('beforeunload', preventLeave)
      document.removeEventListener('click', preventOtherAction, true)
      document.removeEventListener('submit', preventOtherAction, true)
    }
  }, [blocked])
  function undo(operationId: string) {
    if (inFlight.current || !restored || (uncertain && retry.current?.operationId !== operationId))
      return
    inFlight.current = true
    if (!retry.current || retry.current.operationId !== operationId)
      retry.current = { operationId, requestKey: crypto.randomUUID() }
    const request = { workshopDefinitionId, ...retry.current }
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(retry.current))
    } catch {
      /* Keep the same key in memory for retry. */
    }
    startTransition(async () => {
      try {
        const result = await undoDraftTeam(request)
        setMessage(result.error ?? result.message ?? 'Saved to draft.')
        setUncertain(false)
        retry.current = null
        try {
          sessionStorage.removeItem(storageKey)
        } catch {
          /* The authoritative result is known. */
        }
        router.refresh()
      } catch {
        setMessage(
          'Could not confirm Undo. Retry checks the original operation before making changes.'
        )
        setUncertain(true)
      } finally {
        inFlight.current = false
      }
    })
  }
  if (!items.length && !uncertain) return null
  return (
    <details
      ref={root}
      open={uncertain || undefined}
      className="rounded-xl border border-slate-200 bg-white p-4"
    >
      <summary className="cursor-pointer text-sm font-semibold">
        Recent draft changes · Undo
      </summary>
      <p className="mt-2 text-xs text-slate-600">
        Undo is available while affected sessions remain unchanged drafts.
      </p>
      {message && (
        <p role="status" className="mt-3 text-sm">
          {message}
        </p>
      )}
      {uncertain && retry.current && (
        <button
          type="button"
          className="btn-secondary mt-3"
          disabled={pending}
          onClick={() => undo(retry.current!.operationId)}
        >
          Retry Undo
        </button>
      )}
      <ul className="mt-3 space-y-3">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-sm"
          >
            <div className="min-w-0 flex-1">
              <p>{item.summary}</p>
              <time className="text-xs text-slate-500" dateTime={item.createdAt}>
                {new Intl.DateTimeFormat('en-CA', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: 'America/Vancouver',
                }).format(new Date(item.createdAt))}
              </time>
            </div>
            {item.undoneAt ? (
              <span className="text-xs text-slate-500">Undone</span>
            ) : item.canUndo ? (
              <button
                type="button"
                className="btn-secondary"
                disabled={blocked}
                onClick={() => undo(item.id)}
              >
                {pending && retry.current?.operationId === item.id ? 'Undoing…' : 'Undo'}
              </button>
            ) : (
              <span className="text-xs text-slate-500">No changes to undo</span>
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}
