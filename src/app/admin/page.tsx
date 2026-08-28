import Link from 'next/link'
import { School, Users, BookOpen, Calendar } from 'lucide-react'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { formatInstant } from '@/lib/time'
import { StatCard } from '@/components/admin/stat-card'
import { StatusBadge } from '@/components/admin/status-badge'

export default async function AdminDashboard() {
  await requireRole('ADMIN')

  const [schoolCount, teacherCount, classCount, cycles, upcomingWorkshops] = await Promise.all([
    prisma.school.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { role: 'TEACHER', deletedAt: null } }),
    prisma.classSection.count(),
    prisma.cycle.findMany({ orderBy: { startDate: 'desc' }, take: 5 }),
    prisma.workshop.findMany({
      where: { scheduledStart: { not: null } },
      orderBy: { scheduledStart: 'asc' },
      take: 5,
      include: {
        classSection: { include: { school: true } },
      },
    }),
  ])

  const openCycle = cycles.find((c) => c.status === 'OPEN')
  const workshopCount = openCycle
    ? await prisma.workshop.count({ where: { cycleId: openCycle.id } })
    : 0

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">Snapshot of the current scheduling round.</p>
        </div>
        {openCycle && (
          <Link
            href="/admin/schedule"
            className="rounded-lg bg-[#1e2a4a] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a3a5e]"
          >
            Open round
          </Link>
        )}
      </div>

      {/* Stats row */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Schools"
          value={schoolCount}
          icon={<School className="size-5" />}
          color="red"
        />
        <StatCard
          label="Teachers"
          value={teacherCount}
          icon={<Users className="size-5" />}
          color="amber"
        />
        <StatCard
          label="Classes"
          value={classCount}
          subtitle={`Across ${schoolCount} schools`}
          icon={<BookOpen className="size-5" />}
          color="green"
        />
        <StatCard
          label="Workshops"
          value={workshopCount}
          subtitle={openCycle ? openCycle.name : 'No open round'}
          icon={<Calendar className="size-5" />}
          color="blue"
        />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Upcoming workshops */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Upcoming workshops</h2>
              <p className="text-xs text-gray-500">Across all open rounds</p>
            </div>
            <Link
              href="/admin/schedule"
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              View all
            </Link>
          </div>

          {upcomingWorkshops.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">
              No scheduled workshops yet. Open a round and run the scheduler.
            </p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
                  <th className="pb-3 pr-4">Workshop</th>
                  <th className="pb-3 pr-4">School</th>
                  <th className="pb-3 pr-4">Date</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {upcomingWorkshops.map((ws) => (
                  <tr key={ws.id} className="text-sm">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-gray-900">{ws.classSection.name}</p>
                      <p className="text-xs text-gray-400">WS-{ws.id.slice(-4)}</p>
                    </td>
                    <td className="py-3 pr-4 text-gray-600">{ws.classSection.school.name}</td>
                    <td className="py-3 pr-4 text-gray-600">
                      {ws.scheduledStart ? formatInstant(ws.scheduledStart) : '—'}
                    </td>
                    <td className="py-3">
                      <StatusBadge status={ws.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Scheduling rounds */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Scheduling rounds</h2>
          </div>

          {cycles.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">No rounds created yet.</p>
          ) : (
            <div className="space-y-3">
              {cycles.map((cycle) => (
                <div key={cycle.id} className="rounded-lg border border-gray-100 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900">{cycle.name}</p>
                    <StatusBadge status={cycle.status} />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {formatInstant(cycle.startDate)} — {formatInstant(cycle.endDate)}
                  </p>
                </div>
              ))}
            </div>
          )}

          <Link
            href="/admin/cycles"
            className="mt-4 block text-center text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            Manage rounds
          </Link>
        </div>
      </div>
    </div>
  )
}
