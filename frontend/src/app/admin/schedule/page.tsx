'use client'

import { useEffect, useState } from 'react'

import type { Assignment, PA, Workshop } from '@/lib/types'

interface ProposalsData {
  workshops: Workshop[]
  assignments: Assignment[]
  pas: PA[]
}

export default function AdminSchedulePage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [data, setData] = useState<ProposalsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => setIsAdmin(d.role === 'ADMIN'))
  }, [])

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

  async function runSchedule() {
    setLoading(true)
    setMessage('')
    const res = await fetch('/api/schedule/run', { method: 'POST' })
    const result = await res.json()
    setLoading(false)
    if (!res.ok) {
      setMessage(`Error: ${result.error}`)
      return
    }
    await loadProposals()
    setMessage('Schedule run complete.')
  }

  async function loadProposals() {
    const res = await fetch('/api/schedule/proposals')
    if (res.ok) setData(await res.json())
  }

  async function confirmAll() {
    setLoading(true)
    setMessage('')
    const res = await fetch('/api/schedule/confirm', { method: 'POST' })
    const result = await res.json()
    setLoading(false)
    if (!res.ok) {
      setMessage(`Error: ${result.error}`)
      return
    }
    await loadProposals()
    setMessage('All proposals confirmed.')
  }

  if (isAdmin === null) return <p className="p-8">Loading…</p>

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-sm p-8">
        <h1 className="mb-4 text-xl font-semibold">Admin Login</h1>
        <form onSubmit={login} className="flex flex-col gap-3">
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border px-3 py-2"
          />
          {loginError && <p className="text-sm text-red-600">{loginError}</p>}
          <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white">
            Login
          </button>
        </form>
      </main>
    )
  }

  const hasProposed = data?.workshops.some((w) => w.status === 'PROPOSED')

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Workshop Schedule</h1>

      <div className="mb-4 flex gap-3">
        <button
          onClick={runSchedule}
          disabled={loading}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          Run Schedule
        </button>
        {hasProposed && (
          <button
            onClick={confirmAll}
            disabled={loading}
            className="rounded bg-green-600 px-4 py-2 text-white disabled:opacity-50"
          >
            Confirm All
          </button>
        )}
      </div>

      {message && <p className="mb-4 text-sm text-gray-700">{message}</p>}

      {data && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-4">Workshop</th>
              <th className="py-2 pr-4">Scheduled</th>
              <th className="py-2 pr-4">PAs</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.workshops.map((ws) => {
              const wsPAs = data.assignments
                .filter((a) => a.workshopId === ws.id)
                .map((a) => data.pas.find((p) => p.id === a.paId)?.name ?? a.paId)

              return (
                <tr key={ws.id} className="border-b">
                  <td className="py-2 pr-4">{ws.title}</td>
                  <td className="py-2 pr-4">
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
                  <td className="py-2 pr-4">{wsPAs.join(', ') || '—'}</td>
                  <td className="py-2">
                    {ws.status === 'UNDER_SUPPLIED' ? (
                      <span className="font-medium text-red-600">⚠ Under-supplied</span>
                    ) : ws.status === 'CONFIRMED' ? (
                      <span className="font-medium text-green-600">Confirmed</span>
                    ) : ws.status === 'PROPOSED' ? (
                      <span className="text-blue-600">Proposed</span>
                    ) : (
                      <span className="text-gray-400">Unscheduled</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </main>
  )
}
