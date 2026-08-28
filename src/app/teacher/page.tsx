import { Calendar, CheckCircle2, Clock, AlertCircle } from 'lucide-react'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { formatInstant } from '@/lib/time'
import { StatusBadge } from '@/components/admin/status-badge'

export default async function TeacherDashboard() {
  const user = await requireRole('TEACHER')

  const [workshops, availabilityCount] = await Promise.all([
    user.schoolId
      ? prisma.workshop.findMany({
          where: {
            classSection: { schoolId: user.schoolId, school: { deletedAt: null } },
          },
          include: {
            classSection: { select: { name: true, grade: true, subject: true } },
            cycle: { select: { name: true, status: true } },
          },
          orderBy: [{ scheduledStart: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
        })
      : Promise.resolve([]),
    prisma.availability.count({ where: { userId: user.id } }),
  ])

  const thisMonth = workshops.filter((w) => {
    if (!w.scheduledStart) return false
    const now = new Date()
    return (
      w.scheduledStart.getMonth() === now.getMonth() &&
      w.scheduledStart.getFullYear() === now.getFullYear()
    )
  })

  const completed = workshops.filter((w) => w.status === 'COMPLETED')
  const upcoming = workshops.filter(
    (w) => w.scheduledStart && w.scheduledStart > new Date() && w.status !== 'CANCELLED'
  )

  // Find workshops needing attention (unconfirmed dates)
  const needsAttention = workshops.find(
    (w) => w.status === 'SCHEDULED' && w.scheduledStart
  )

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My workshops</h1>
        <p className="text-sm text-gray-500">Sessions booked for your classes.</p>
      </div>

      {/* Action required banner */}
      {needsAttention && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-full bg-amber-100">
              <AlertCircle className="size-4 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-900">Action required</p>
              <p className="text-xs text-amber-700">
                Confirm the date for {needsAttention.classSection.name}.
              </p>
            </div>
          </div>
          <button className="rounded-lg bg-[#1e2a4a] px-4 py-2 text-xs font-medium text-white hover:bg-[#2a3a5e]">
            Confirm date
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex size-10 items-center justify-center rounded-full bg-blue-100">
            <Calendar className="size-5 text-blue-600" />
          </div>
          <div>
            <p className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">This month</p>
            <p className="text-xl font-bold text-gray-900">{thisMonth.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex size-10 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="size-5 text-green-600" />
          </div>
          <div>
            <p className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">Completed</p>
            <p className="text-xl font-bold text-gray-900">{completed.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex size-10 items-center justify-center rounded-full bg-amber-100">
            <Clock className="size-5 text-amber-600" />
          </div>
          <div>
            <p className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">Availability</p>
            <p className="text-xl font-bold text-gray-900">{availabilityCount} slots</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex size-10 items-center justify-center rounded-full bg-purple-100">
            <Calendar className="size-5 text-purple-600" />
          </div>
          <div>
            <p className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">Upcoming</p>
            <p className="text-xl font-bold text-gray-900">{upcoming.length}</p>
          </div>
        </div>
      </div>

      {/* Upcoming sessions */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Upcoming sessions</h2>

        {upcoming.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">
            No upcoming sessions scheduled.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {upcoming.map((ws) => (
              <div key={ws.id} className="flex items-center justify-between py-4">
                <div className="flex items-center gap-4">
                  <div className="flex size-10 items-center justify-center rounded-full bg-amber-50">
                    <Calendar className="size-4 text-amber-500" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{ws.classSection.name}</p>
                    <p className="text-xs text-gray-400">
                      <Clock className="mr-1 inline size-3" />
                      {ws.scheduledStart ? formatInstant(ws.scheduledStart) : 'TBD'}
                    </p>
                  </div>
                </div>
                <StatusBadge status={ws.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
