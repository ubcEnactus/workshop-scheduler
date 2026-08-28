'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Calendar } from 'lucide-react'

import { StatusBadge } from '@/components/admin/status-badge'
import { OpenRoundModal, RoundOpenedModal } from '@/components/admin/modals'

interface CycleData {
  id: string
  name: string
  startDate: string
  endDate: string
  updatedAt: string
  createdAt: string
  status: string
  workshopCount: number
}

interface CycleGridProps {
  cycles: CycleData[]
  classCount: number
  openCycleAction: (id: string) => Promise<{ ok: boolean; workshopCount?: number; error?: string }>
  closeCycleAction: (id: string) => Promise<{ ok: boolean; error?: string }>
  deleteCycleAction: (id: string) => Promise<{ ok: boolean; error?: string }>
}

function formatDateRange(start: string, end: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', year: 'numeric' })
  return `${fmt.format(new Date(start))} – ${fmt.format(new Date(end))}`
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

export function CycleGrid({
  cycles,
  classCount,
  openCycleAction,
  closeCycleAction,
  deleteCycleAction,
}: CycleGridProps) {
  const [confirmModal, setConfirmModal] = useState<CycleData | null>(null)
  const [successModal, setSuccessModal] = useState<{ name: string; workshopCount: number } | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleOpenClick(cycle: CycleData) {
    setConfirmModal(cycle)
  }

  function handleConfirmOpen() {
    if (!confirmModal) return
    const cycle = confirmModal
    startTransition(async () => {
      const result = await openCycleAction(cycle.id)
      setConfirmModal(null)
      if (result.ok) {
        setSuccessModal({ name: cycle.name, workshopCount: result.workshopCount ?? classCount })
      }
    })
  }

  function handleClose(id: string) {
    startTransition(async () => {
      await closeCycleAction(id)
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteCycleAction(id)
    })
  }

  if (cycles.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
        <Calendar className="mx-auto size-10 text-gray-300" />
        <p className="mt-3 text-sm text-gray-500">No rounds yet. Create your first one to get started.</p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {cycles.map((cycle) => (
          <div
            key={cycle.id}
            className="rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-500">
                  <Calendar className="size-5" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{cycle.name}</p>
                  <p className="text-xs text-gray-400">
                    {formatDateRange(cycle.startDate, cycle.endDate)} · R-{cycle.id.slice(-3)}
                  </p>
                </div>
              </div>
              <StatusBadge status={cycle.status} />
            </div>

            <div className="mt-4 flex gap-6">
              <div>
                <p className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">
                  Classes
                </p>
                <p className="text-xl font-bold text-gray-900">
                  {cycle.status === 'DRAFT' ? classCount : cycle.workshopCount}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">
                  Workshops
                </p>
                <p className="text-xl font-bold text-gray-900">{cycle.workshopCount}</p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-400">
                {cycle.status === 'DRAFT' && 'Ready to open · workshops will be created on open'}
                {cycle.status === 'OPEN' && `Opened ${formatDate(cycle.updatedAt)}`}
                {cycle.status === 'SCHEDULED' && `Scheduled ${formatDate(cycle.updatedAt)}`}
                {cycle.status === 'CLOSED' && `Closed · opened ${formatDate(cycle.createdAt)}`}
              </p>
              <div className="flex items-center gap-2">
                {cycle.status === 'DRAFT' && (
                  <>
                    <button
                      onClick={() => handleOpenClick(cycle)}
                      disabled={isPending}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                    >
                      Open round
                    </button>
                    <button
                      onClick={() => handleDelete(cycle.id)}
                      disabled={isPending}
                      className="text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </>
                )}
                {cycle.status === 'OPEN' && (
                  <>
                    <Link
                      href="/admin/schedule"
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      View workshops
                    </Link>
                    <button
                      onClick={() => handleClose(cycle.id)}
                      disabled={isPending}
                      className="text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50"
                    >
                      Close
                    </button>
                  </>
                )}
                {cycle.status === 'SCHEDULED' && (
                  <button
                    onClick={() => handleClose(cycle.id)}
                    disabled={isPending}
                    className="text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50"
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <OpenRoundModal
        open={!!confirmModal}
        onClose={() => setConfirmModal(null)}
        onConfirm={handleConfirmOpen}
        roundName={confirmModal?.name ?? ''}
        classCount={classCount}
        loading={isPending}
      />

      <RoundOpenedModal
        open={!!successModal}
        onClose={() => setSuccessModal(null)}
        roundName={successModal?.name ?? ''}
        workshopCount={successModal?.workshopCount ?? 0}
      />
    </>
  )
}
