'use client'

import { useState } from 'react'
import type { Assignment, User, Workshop, WorkshopStatus } from '@prisma/client'
import { runScheduleAction, confirmAllAction } from './actions'

interface ProposalsData {
  workshops: (Workshop & { classSection?: { name: string } })[]
  assignments: Assignment[]
  pas: User[]
}

const STATUS_STYLES: Record<WorkshopStatus, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-700',
  CONFIRMED: 'bg-green-100 text-green-700',
  UNSCHEDULED: 'bg-gray-100 text-gray-500',
  COMPLETED: 'bg-purple-100 text-purple-700',
  CANCELLED: 'bg-red-100 text-red-700',
}

const STATUS_LABEL: Record<WorkshopStatus, string> = {
  SCHEDULED: 'Proposed', // We show SCHEDULED as Proposed in the UI per original design
  CONFIRMED: 'Confirmed',
  UNSCHEDULED: 'Unscheduled',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

function StatusBadge({ status }: { status: WorkshopStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export default function ScheduleClient({ initialData }: { initialData: ProposalsData }) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)

  // Actually, since we revalidatePath in Server Actions, initialData will be fresh.
  const data = initialData

  async function runSchedule() {
    setLoading(true)
    setMessage(null)
    try {
      await runScheduleAction()
      setMessage({ text: 'Schedule generated.' })
    } catch (e: any) {
      setMessage({ text: e.message || 'Error running schedule', error: true })
    } finally {
      setLoading(false)
    }
  }

  async function confirmAll() {
    setLoading(true)
    setMessage(null)
    try {
      await confirmAllAction()
      setMessage({ text: 'All proposals confirmed.' })
    } catch (e: any) {
      setMessage({ text: e.message || 'Error confirming', error: true })
    } finally {
      setLoading(false)
    }
  }

  const counts = {
    proposed: data.workshops.filter((w) => w.status === 'SCHEDULED').length,
    confirmed: data.workshops.filter((w) => w.status === 'CONFIRMED').length,
    unscheduled: data.workshops.filter((w) => w.status === 'UNSCHEDULED').length,
  }

  const hasProposed = counts.proposed > 0

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Workshop Schedule</h1>
        <p className="mt-1 text-sm text-gray-500">Generate proposals and confirm PA assignments.</p>
      </div>

      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={runSchedule}
          disabled={loading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Running…' : 'Run Schedule'}
        </button>
        {hasProposed && (
          <button
            onClick={confirmAll}
            disabled={loading}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            Confirm All
          </button>
        )}
      </div>

      {message && (
        <p className={`mb-5 text-sm ${message.error ? 'text-red-600' : 'text-gray-600'}`}>
          {message.text}
        </p>
      )}

      <div className="mb-6 flex gap-4 text-sm text-gray-500">
        <span>{counts.proposed} proposed</span>
        <span>{counts.confirmed} confirmed</span>
        {counts.unscheduled > 0 && (
          <span className="text-gray-500">{counts.unscheduled} unscheduled</span>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3">Workshop</th>
              <th className="px-4 py-3">Scheduled</th>
              <th className="px-4 py-3">PAs</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.workshops.map((ws) => {
              const wsPAs = data.assignments
                .filter((a) => a.workshopId === ws.id)
                .map((a) => data.pas.find((p) => p.id === a.paId)?.name ?? a.paId)

              return (
                <tr key={ws.id} className="bg-white hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    {ws.classSection?.name || `Workshop ${ws.id.slice(-4)}`}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {ws.scheduledStart
                      ? new Date(ws.scheduledStart).toLocaleString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{wsPAs.join(', ') || '—'}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={ws.status} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </main>
  )
}
