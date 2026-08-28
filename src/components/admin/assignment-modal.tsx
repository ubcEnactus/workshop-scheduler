'use client'

import { useState, useTransition, useEffect } from 'react'
import { X, UserPlus, UserMinus, Loader2 } from 'lucide-react'
import { getAvailablePAsAction, assignPAAction, unassignPAAction } from '@/app/admin/schedule/actions'

interface AssignedPA {
  paId: string
  paName: string | null
  paEmail: string
  status: string
}

interface AvailablePA {
  id: string
  name: string | null
  email: string
  community: string | null
}

interface AssignmentModalProps {
  workshopId: string
  workshopName: string
  assignments: AssignedPA[]
  onClose: () => void
}

export function AssignmentModal({
  workshopId,
  workshopName,
  assignments,
  onClose,
}: AssignmentModalProps) {
  const [availablePAs, setAvailablePAs] = useState<AvailablePA[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    getAvailablePAsAction(workshopId).then((pas) => {
      if (!cancelled) {
        setAvailablePAs(pas)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [workshopId])

  function handleAssign(paId: string) {
    setError(null)
    const fd = new FormData()
    fd.set('workshopId', workshopId)
    fd.set('paId', paId)
    startTransition(async () => {
      const res = await assignPAAction(fd)
      if (!res.ok) {
        setError(res.error)
      } else {
        const updated = await getAvailablePAsAction(workshopId)
        setAvailablePAs(updated)
      }
    })
  }

  function handleUnassign(paId: string) {
    setError(null)
    const fd = new FormData()
    fd.set('workshopId', workshopId)
    fd.set('paId', paId)
    startTransition(async () => {
      const res = await unassignPAAction(fd)
      if (!res.ok) {
        setError(res.error)
      } else {
        const updated = await getAvailablePAsAction(workshopId)
        setAvailablePAs(updated)
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Adjust PAs</h2>
            <p className="text-sm text-gray-500">{workshopName}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Current assignments */}
        <div className="border-b border-gray-100 px-6 py-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">Currently assigned</h3>
          {assignments.length === 0 ? (
            <p className="text-sm text-gray-400">No PAs assigned yet.</p>
          ) : (
            <ul className="space-y-2">
              {assignments.map((a) => (
                <li key={a.paId} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{a.paName ?? a.paEmail}</p>
                    <p className="text-xs text-gray-400">{a.status}</p>
                  </div>
                  <button
                    onClick={() => handleUnassign(a.paId)}
                    disabled={isPending}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                  >
                    <UserMinus className="size-3" />
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Available PAs */}
        <div className="max-h-64 overflow-y-auto px-6 py-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">Available to add</h3>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="size-4 animate-spin" /> Loading available PAs...
            </div>
          ) : availablePAs.length === 0 ? (
            <p className="text-sm text-gray-400">No additional PAs available for this slot.</p>
          ) : (
            <ul className="space-y-2">
              {availablePAs.map((pa) => (
                <li key={pa.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{pa.name ?? pa.email}</p>
                    <p className="text-xs text-gray-400">{pa.community ?? 'No community'}</p>
                  </div>
                  <button
                    onClick={() => handleAssign(pa.id)}
                    disabled={isPending}
                    className="flex items-center gap-1 rounded-lg bg-green-50 px-2 py-1 text-xs font-medium text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50"
                  >
                    <UserPlus className="size-3" />
                    Add
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg bg-[#1e2a4a] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a3a5e]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
