'use client'

import { useEffect, useState } from 'react'

import type { Assignment, PA, Workshop, WorkshopStatus } from '@/lib/types'

interface ProposalsData {
  workshops: Workshop[]
  assignments: Assignment[]
  pas: PA[]
}

const STATUS_STYLES: Record<WorkshopStatus, string> = {
  PROPOSED: 'bg-blue-100 text-blue-700',
  CONFIRMED: 'bg-green-100 text-green-700',
  UNDER_SUPPLIED: 'bg-red-100 text-red-700',
  UNSCHEDULED: 'bg-gray-100 text-gray-500',
}

const STATUS_LABEL: Record<WorkshopStatus, string> = {
  PROPOSED: 'Proposed',
  CONFIRMED: 'Confirmed',
  UNDER_SUPPLIED: '⚠ Under-supplied',
  UNSCHEDULED: 'Unscheduled',
}

function StatusBadge({ status }: { status: WorkshopStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export default function AdminSchedulePage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [data, setData] = useState<ProposalsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => setIsAdmin(d.role === 'ADMIN'))
  }, [])

  // Load any existing proposals once we know the user is admin
  useEffect(() => {
    if (isAdmin) loadProposals()
  }, [isAdmin])

  async function login(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) {
      setIsAdmin(true)
      setLoginError('')
    } else {
      setLoginError('Invalid password')
    }
  }

  async function loadProposals() {
    const res = await fetch('/api/schedule/proposals')
    if (res.ok) setData(await res.json())
  }

  async function runSchedule() {
    setLoading(true)
    setMessage(null)
    const res = await fetch('/api/schedule/run', { method: 'POST' })
    const result = await res.json()
    setLoading(false)
    if (!res.ok) {
      setMessage({ text: result.error, error: true })
      return
    }
    await loadProposals()
    setMessage({ text: 'Schedule generated.' })
  }

  async function confirmAll() {
    setLoading(true)
    setMessage(null)
    const res = await fetch('/api/schedule/confirm', { method: 'POST' })
    const result = await res.json()
    setLoading(false)
    if (!res.ok) {
      setMessage({ text: result.error, error: true })
      return
    }
    await loadProposals()
    setMessage({ text: 'All proposals confirmed.' })
  }

  if (isAdmin === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-400">Loading…</div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm rounded-xl border bg-white p-8 shadow-sm">
          <h1 className="mb-1 text-xl font-semibold">Admin Login</h1>
          <p className="mb-6 text-sm text-gray-500">Workshop Scheduler</p>
          <form onSubmit={login} className="flex flex-col gap-3">
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            {loginError && <p className="text-sm text-red-600">{loginError}</p>}
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Login
            </button>
          </form>
        </div>
      </div>
    )
  }

  const counts = data
    ? {
        proposed: data.workshops.filter((w) => w.status === 'PROPOSED').length,
        confirmed: data.workshops.filter((w) => w.status === 'CONFIRMED').length,
        underSupplied: data.workshops.filter((w) => w.status === 'UNDER_SUPPLIED').length,
      }
    : null

  const hasProposed = counts && counts.proposed > 0

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

      {counts && (
        <div className="mb-6 flex gap-4 text-sm text-gray-500">
          <span>{counts.proposed} proposed</span>
          <span>{counts.confirmed} confirmed</span>
          {counts.underSupplied > 0 && (
            <span className="text-red-500">{counts.underSupplied} under-supplied</span>
          )}
        </div>
      )}

      {data ? (
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
                    <td className="px-4 py-3 font-medium">{ws.title}</td>
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
      ) : (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-gray-400">
          Run the schedule to see proposals.
        </div>
      )}
    </main>
  )
}
