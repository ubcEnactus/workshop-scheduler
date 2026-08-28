import Link from 'next/link'
import { Calendar } from 'lucide-react'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { StatusBadge } from '@/components/admin/status-badge'
import { openCycle, closeCycle, deleteCycle } from './actions'

function formatDateRange(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    year: 'numeric',
  })
  return `${fmt.format(start)} – ${fmt.format(end)}`
}

function formatOpenedDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export default async function CyclesPage() {
  await requireRole('ADMIN')

  const cycles = await prisma.cycle.findMany({
    include: {
      _count: { select: { workshops: true } },
    },
    orderBy: { startDate: 'desc' },
  })

  // Get class count for context
  const classCount = await prisma.classSection.count({
    where: { school: { deletedAt: null }, teacher: { deletedAt: null } },
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scheduling rounds</h1>
          <p className="text-sm text-gray-500">
            Create rounds as drafts, then open them to generate one empty workshop per class.
          </p>
        </div>
        <Link
          href="/admin/cycles/new"
          className="rounded-lg bg-[#1e2a4a] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a3a5e]"
        >
          + New round
        </Link>
      </div>

      {cycles.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
          <Calendar className="mx-auto size-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">No rounds yet. Create your first one to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {cycles.map((cycle) => (
            <div
              key={cycle.id}
              className="rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-sm"
            >
              {/* Header */}
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

              {/* Stats */}
              <div className="mt-4 flex gap-6">
                <div>
                  <p className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">Classes</p>
                  <p className="text-xl font-bold text-gray-900">
                    {cycle.status === 'DRAFT' ? classCount : cycle._count.workshops}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">Workshops</p>
                  <p className="text-xl font-bold text-gray-900">{cycle._count.workshops}</p>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
                <p className="text-xs text-gray-400">
                  {cycle.status === 'DRAFT' && 'Ready to open · workshops will be created on open'}
                  {cycle.status === 'OPEN' && `Opened ${formatOpenedDate(cycle.updatedAt)}`}
                  {cycle.status === 'SCHEDULED' && `Scheduled ${formatOpenedDate(cycle.updatedAt)}`}
                  {cycle.status === 'CLOSED' && `Closed · opened ${formatOpenedDate(cycle.createdAt)}`}
                </p>
                <div className="flex items-center gap-2">
                  {cycle.status === 'DRAFT' && (
                    <>
                      <form action={openCycle}>
                        <input type="hidden" name="id" value={cycle.id} />
                        <button
                          type="submit"
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
                        >
                          Open round
                        </button>
                      </form>
                      <form action={deleteCycle}>
                        <input type="hidden" name="id" value={cycle.id} />
                        <button
                          type="submit"
                          className="text-xs font-medium text-red-500 hover:text-red-700"
                        >
                          Delete
                        </button>
                      </form>
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
                      <form action={closeCycle}>
                        <input type="hidden" name="id" value={cycle.id} />
                        <button
                          type="submit"
                          className="text-xs font-medium text-gray-500 hover:text-gray-700"
                        >
                          Close
                        </button>
                      </form>
                    </>
                  )}
                  {cycle.status === 'SCHEDULED' && (
                    <form action={closeCycle}>
                      <input type="hidden" name="id" value={cycle.id} />
                      <button
                        type="submit"
                        className="text-xs font-medium text-gray-500 hover:text-gray-700"
                      >
                        Close
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
