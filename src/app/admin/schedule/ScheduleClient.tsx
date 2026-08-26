'use client'

import { useState, useTransition } from 'react'
import type { WorkshopStatus } from '@prisma/client'

import { Button } from '@/components/ui/button'
import { confirmAllAction, runScheduleAction, unconfirmWorkshopAction } from './actions'

/** A workshop row, fully rendered by the Server Component (see page.tsx). */
export type ScheduleRow = {
  id: string
  className: string
  schoolName: string
  time: string | null
  status: WorkshopStatus
  pas: string[]
}

// Workshop.SCHEDULED means "the scheduler placed it, an admin hasn't signed
// off yet" — the UI calls that Proposed.
const STATUS_LABEL: Record<WorkshopStatus, string> = {
  UNSCHEDULED: 'Unscheduled',
  SCHEDULED: 'Proposed',
  CONFIRMED: 'Confirmed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

const STATUS_STYLES: Record<WorkshopStatus, string> = {
  UNSCHEDULED: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  SCHEDULED: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  CONFIRMED: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  COMPLETED: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
}

function StatusBadge({ status }: { status: WorkshopStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}

type Message = { text: string; error?: boolean }

export function ScheduleClient({
  cycleName,
  rows,
}: {
  cycleName: string | null
  rows: ScheduleRow[]
}) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<Message | null>(null)

  function run(action: () => Promise<Message>) {
    setMessage(null)
    startTransition(async () => setMessage(await action()))
  }

  const counts = {
    proposed: rows.filter((r) => r.status === 'SCHEDULED').length,
    confirmed: rows.filter((r) => r.status === 'CONFIRMED').length,
    unscheduled: rows.filter((r) => r.status === 'UNSCHEDULED').length,
  }

  if (!cycleName) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Schedule</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          No open cycle. Open one from Cycles to start scheduling.
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Schedule</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Match PAs to workshops for {cycleName}, then confirm the proposals.
      </p>

      <div className="mt-6 flex items-center gap-3">
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const result = await runScheduleAction()
              if (!result.ok) return { text: result.error, error: true }
              const { scheduled, unscheduled } = result
              return {
                text:
                  unscheduled > 0
                    ? `Scheduled ${scheduled}. ${unscheduled} couldn't be filled — not enough available PAs.`
                    : `Scheduled ${scheduled} workshop${scheduled === 1 ? '' : 's'}.`,
              }
            })
          }
        >
          {pending ? 'Working…' : 'Run scheduler'}
        </Button>
        {counts.proposed > 0 ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const result = await confirmAllAction()
                return result.ok
                  ? { text: 'All proposals confirmed.' }
                  : { text: result.error, error: true }
              })
            }
          >
            Confirm all
          </Button>
        ) : null}
      </div>

      {message ? (
        <p
          className={`mt-4 text-sm ${
            message.error ? 'text-red-600 dark:text-red-400' : 'text-zinc-600 dark:text-zinc-400'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <p className="mt-6 flex gap-4 text-sm text-zinc-500">
        <span>{counts.proposed} proposed</span>
        <span>{counts.confirmed} confirmed</span>
        <span>{counts.unscheduled} unscheduled</span>
      </p>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          No workshops in this cycle yet.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left dark:border-zinc-800">
                <th className="px-4 py-2 font-medium">Class</th>
                <th className="px-4 py-2 font-medium">Time</th>
                <th className="px-4 py-2 font-medium">PAs</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800/60"
                >
                  <td className="px-4 py-2">
                    <p className="font-medium">{row.className}</p>
                    <p className="text-xs text-zinc-500">{row.schoolName}</p>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                    {row.time ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                    {row.pas.join(', ') || '—'}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    {row.status === 'CONFIRMED' ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(async () => {
                            const result = await unconfirmWorkshopAction(row.id)
                            return result.ok
                              ? {
                                  text: `Reopened ${row.className}. Re-run the scheduler to move it.`,
                                }
                              : { text: result.error, error: true }
                          })
                        }
                        className="text-xs font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-100"
                      >
                        Reopen
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
