'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Play, CheckCircle2, AlertTriangle, RefreshCw, Sparkles, Settings } from 'lucide-react'

import { StatusBadge } from '@/components/admin/status-badge'

interface WorkshopData {
  id: string
  className: string
  schoolName: string
  grade: string | null
  subject: string | null
  scheduledStart: string | null
  scheduledEnd: string | null
  status: string
  minPAs: number
  assignments: { paId: string; paName: string | null; paEmail: string; status: string }[]
}

interface SchedulePageData {
  cycleName: string
  cycleId: string
  workshopCount: number
  paCount: number
  schoolCount: number
  classCount: number
  minPAs: number
}

interface ScheduleReviewClientProps {
  data: SchedulePageData
  workshops: WorkshopData[]
  runSchedulerAction: () => Promise<{
    ok: boolean
    scheduled?: number
    unscheduled?: number
    error?: string
  }>
  confirmAllAction: () => Promise<{ ok: boolean; error?: string }>
}

type Step = 'setup' | 'running' | 'review' | 'confirmed'

const STEPS = [
  { key: 'setup', label: 'Set up' },
  { key: 'running', label: 'Run' },
  { key: 'review', label: 'Review' },
  { key: 'confirmed', label: 'Confirm' },
] as const

function StepIndicator({ current }: { current: Step }) {
  const currentIdx = STEPS.findIndex((s) => s.key === current)
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((step, i) => {
        const isActive = i === currentIdx
        const isDone = i < currentIdx
        return (
          <div key={step.key} className="flex items-center gap-2">
            <div
              className={`flex size-6 items-center justify-center rounded-full text-xs font-bold ${
                isDone
                  ? 'bg-[#1e2a4a] text-white'
                  : isActive
                    ? 'bg-amber-400 text-white'
                    : 'bg-gray-200 text-gray-500'
              }`}
            >
              {isDone ? (
                <CheckCircle2 className="size-4" />
              ) : (
                i + 1
              )}
            </div>
            <span
              className={`text-sm font-medium ${isActive ? 'text-gray-900' : 'text-gray-400'}`}
            >
              {step.label}
            </span>
            {i < STEPS.length - 1 && <span className="mx-1 text-gray-300">&rarr;</span>}
          </div>
        )
      })}
    </div>
  )
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Vancouver',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function ScheduleReviewClient({
  data,
  workshops,
  runSchedulerAction,
  confirmAllAction,
}: ScheduleReviewClientProps) {
  const hasScheduled = workshops.some((w) => w.status === 'SCHEDULED' || w.status === 'CONFIRMED')
  const [step, setStep] = useState<Step>(hasScheduled ? 'review' : 'setup')
  const [result, setResult] = useState<{ scheduled: number; unscheduled: number } | null>(
    hasScheduled
      ? {
          scheduled: workshops.filter((w) => w.status === 'SCHEDULED' || w.status === 'CONFIRMED').length,
          unscheduled: workshops.filter((w) => w.status === 'UNSCHEDULED').length,
        }
      : null
  )
  const [isPending, startTransition] = useTransition()

  function handleRunScheduler() {
    setStep('running')
    startTransition(async () => {
      const res = await runSchedulerAction()
      if (res.ok) {
        setResult({ scheduled: res.scheduled ?? 0, unscheduled: res.unscheduled ?? 0 })
        setStep('review')
      } else {
        setStep('setup')
      }
    })
  }

  function handleConfirmAll() {
    startTransition(async () => {
      const res = await confirmAllAction()
      if (res.ok) {
        setStep('confirmed')
      }
    })
  }

  function handleStartNewRun() {
    setStep('setup')
    setResult(null)
  }

  // Categorize workshops
  const problems = workshops.filter(
    (w) => w.status === 'UNSCHEDULED' || (w.status === 'SCHEDULED' && w.assignments.length < w.minPAs)
  )
  const proposed = workshops.filter(
    (w) => w.status === 'SCHEDULED' && w.assignments.length >= w.minPAs
  )
  const confirmed = workshops.filter((w) => w.status === 'CONFIRMED')

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedule & review</h1>
          <p className="text-sm text-gray-500">
            Run the scheduler, review what it proposes, adjust anything that isn&apos;t right, then
            confirm.
          </p>
        </div>
        {step === 'review' && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleStartNewRun}
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className="size-3.5" />
              Re-run
            </button>
            <button
              onClick={handleConfirmAll}
              disabled={isPending}
              className="rounded-lg bg-[#1e2a4a] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a3a5e] disabled:opacity-50"
            >
              Confirm all
            </button>
          </div>
        )}
        {step === 'confirmed' && (
          <button
            onClick={handleStartNewRun}
            className="text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            Start new run
          </button>
        )}
      </div>

      {/* Step indicator */}
      <div className="mb-8">
        <StepIndicator current={step} />
      </div>

      {/* Step 1: Setup */}
      {step === 'setup' && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-xl bg-amber-100">
              <Sparkles className="size-6 text-amber-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">{data.cycleName}</p>
              <p className="text-sm text-gray-500">
                {data.workshopCount} empty workshops · {data.paCount} PAs available · {data.schoolCount} schools
              </p>
            </div>
          </div>

          {/* Status cards */}
          <div className="mt-6 grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-gray-100 p-4">
              <p className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">
                Class meeting times
              </p>
              <div className="mt-1 flex items-center gap-2">
                <div className="size-2 rounded-full bg-green-500" />
                <p className="text-sm font-semibold text-gray-900">Locked</p>
              </div>
            </div>
            <div className="rounded-lg border border-gray-100 p-4">
              <p className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">
                PA Availability
              </p>
              <div className="mt-1 flex items-center gap-2">
                <div className="size-2 rounded-full bg-green-500" />
                <p className="text-sm font-semibold text-gray-900">Confirmed</p>
              </div>
            </div>
            <div className="rounded-lg border border-gray-100 p-4">
              <p className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">
                Min PAs per workshop
              </p>
              <div className="mt-1 flex items-center gap-2">
                <div className="size-2 rounded-full bg-blue-500" />
                <p className="text-sm font-semibold text-gray-900">{data.minPAs}</p>
              </div>
            </div>
          </div>

          {/* Explanation */}
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">What happens when you run</p>
            <ul className="mt-2 space-y-1 text-sm text-amber-800">
              <li>Each empty workshop gets a proposed time and PA assignments.</li>
              <li>Nothing is saved yet — you review and adjust everything before confirming.</li>
              <li>Workshops that can&apos;t be scheduled or are short-staffed are called out clearly.</li>
            </ul>
          </div>

          <button
            onClick={handleRunScheduler}
            className="mt-6 flex items-center gap-2 rounded-lg bg-[#1e2a4a] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2a3a5e]"
          >
            <Play className="size-4" />
            Run scheduler
          </button>
        </div>
      )}

      {/* Step 2: Running */}
      {step === 'running' && (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-amber-100">
            <Sparkles className="size-8 text-amber-600 animate-pulse" />
          </div>
          <h2 className="mt-6 text-xl font-bold text-gray-900">Running the scheduler...</h2>
          <p className="mt-2 text-sm text-gray-500">
            Matching workshops to available meeting times and PAs. This usually takes a few seconds.
          </p>
          <div className="mx-auto mt-6 h-2 w-64 overflow-hidden rounded-full bg-gray-200">
            <div className="h-full animate-pulse rounded-full bg-[#1e2a4a]" style={{ width: '72%' }} />
          </div>
          <p className="mt-2 text-xs text-gray-400">72%</p>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 'review' && result && (
        <div>
          {/* Summary stats */}
          <div className="mb-6 grid grid-cols-4 gap-4">
            <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex size-10 items-center justify-center rounded-full bg-blue-100">
                <Sparkles className="size-5 text-blue-600" />
              </div>
              <div>
                <p className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">Total workshops</p>
                <p className="text-xl font-bold text-gray-900">{workshops.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex size-10 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2 className="size-5 text-green-600" />
              </div>
              <div>
                <p className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">Scheduled cleanly</p>
                <p className="text-xl font-bold text-gray-900">{proposed.length + confirmed.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex size-10 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle className="size-5 text-amber-600" />
              </div>
              <div>
                <p className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">Short-staffed</p>
                <p className="text-xl font-bold text-gray-900">
                  {problems.filter((w) => w.status === 'SCHEDULED').length}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex size-10 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="size-5 text-red-500" />
              </div>
              <div>
                <p className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">Couldn&apos;t schedule</p>
                <p className="text-xl font-bold text-gray-900">
                  {problems.filter((w) => w.status === 'UNSCHEDULED').length}
                </p>
              </div>
            </div>
          </div>

          {/* Problems section */}
          {problems.length > 0 && (
            <div className="mb-8">
              <div className="mb-3 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-amber-600" />
                  <p className="text-sm font-medium text-amber-900">
                    {problems.length} workshops need your attention
                  </p>
                </div>
              </div>

              <h3 className="mb-2 text-lg font-semibold text-gray-900">
                Problems — resolve before confirming
              </h3>
              <p className="mb-4 text-sm text-gray-500">
                These workshops failed one or more constraints. They stay visible until you fix or
                accept them.
              </p>

              <div className="rounded-xl border border-gray-200 bg-white">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
                      <th className="px-5 py-3">Workshop</th>
                      <th className="px-5 py-3">Proposed time</th>
                      <th className="px-5 py-3">Proposed PAs</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {problems.map((ws) => (
                      <tr key={ws.id} className="border-l-4 border-l-amber-400">
                        <td className="px-5 py-4">
                          <p className="font-medium text-gray-900">{ws.className}</p>
                          <p className="text-xs text-gray-400">
                            {ws.grade ? `Grade ${ws.grade} ` : ''}{ws.subject ?? ''} · {ws.schoolName}
                          </p>
                          <p className="text-[10px] text-gray-300">WS-{ws.id.slice(-4)}</p>
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-600">
                          {ws.scheduledStart ? (
                            formatDateTime(ws.scheduledStart)
                          ) : (
                            <span className="text-red-500">No time found</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-sm">
                          {ws.assignments.length > 0 ? (
                            <div className="space-y-0.5">
                              {ws.assignments.map((a) => (
                                <p key={a.paId} className="text-gray-700">
                                  {a.paName ?? a.paEmail}
                                </p>
                              ))}
                            </div>
                          ) : (
                            <span className="text-red-500">None assigned (need {ws.minPAs})</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          {ws.status === 'UNSCHEDULED' ? (
                            <StatusBadge status="cancelled" label="Couldn't schedule" />
                          ) : (
                            <StatusBadge status="pending" label="Short-staffed" />
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <button className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700">
                              <Settings className="size-3" />
                              Adjust
                            </button>
                            <button className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700">
                              Accept
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Proposed workshops */}
          {proposed.length > 0 && (
            <div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900">Proposed workshops</h3>
              <p className="mb-4 text-sm text-gray-500">
                Scheduled cleanly. Accept each to lock it in, or adjust as needed.
              </p>

              <div className="rounded-xl border border-gray-200 bg-white">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
                      <th className="px-5 py-3">Workshop</th>
                      <th className="px-5 py-3">Proposed time</th>
                      <th className="px-5 py-3">Proposed PAs</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {proposed.map((ws) => (
                      <tr key={ws.id}>
                        <td className="px-5 py-4">
                          <p className="font-medium text-gray-900">{ws.className}</p>
                          <p className="text-xs text-gray-400">
                            {ws.grade ? `Grade ${ws.grade} ` : ''}{ws.subject ?? ''} · {ws.schoolName}
                          </p>
                          <p className="text-[10px] text-gray-300">WS-{ws.id.slice(-4)}</p>
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-600">
                          {ws.scheduledStart ? formatDateTime(ws.scheduledStart) : '—'}
                        </td>
                        <td className="px-5 py-4 text-sm">
                          <div className="space-y-0.5">
                            {ws.assignments.map((a) => (
                              <p key={a.paId} className="text-gray-700">
                                {a.paName ?? a.paEmail}
                              </p>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge status="pending" label="Proposed" />
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <button className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700">
                              <Settings className="size-3" />
                              Adjust
                            </button>
                            <button className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700">
                              Accept
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Confirmed */}
      {step === 'confirmed' && (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="size-7 text-green-600" />
          </div>
          <h2 className="mt-4 text-xl font-bold text-gray-900">Schedule confirmed</h2>
          <p className="mt-2 text-sm text-gray-500">
            {result?.scheduled ?? 0} workshops locked in — teachers and PAs will be notified.{' '}
            {(result?.unscheduled ?? 0) > 0 &&
              `${result?.unscheduled} still need follow-up and remain flagged in Rounds.`}
          </p>

          <div className="mt-6 flex items-center justify-center gap-6">
            <div className="rounded-xl border border-green-200 bg-green-50 px-6 py-3 text-center">
              <p className="text-2xl font-bold text-green-700">{result?.scheduled ?? 0}</p>
              <p className="text-[10px] font-medium tracking-wide text-green-600 uppercase">Confirmed</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-3 text-center">
              <p className="text-2xl font-bold text-amber-700">{result?.unscheduled ?? 0}</p>
              <p className="text-[10px] font-medium tracking-wide text-amber-600 uppercase">Flagged</p>
            </div>
            <div className="rounded-xl border border-purple-200 bg-purple-50 px-6 py-3 text-center">
              <p className="text-2xl font-bold text-purple-700">{workshops.length}</p>
              <p className="text-[10px] font-medium tracking-wide text-purple-600 uppercase">Total</p>
            </div>
          </div>

          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/admin/cycles"
              className="text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              View schedule
            </Link>
            <button className="rounded-lg bg-[#1e2a4a] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2a3a5e]">
              Notify teachers
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
