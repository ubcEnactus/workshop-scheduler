import { Calendar, CheckCircle2, Clock, School } from 'lucide-react'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { formatInstant, VANCOUVER_TZ } from '@/lib/time'
import { StatusBadge } from '@/components/admin/status-badge'

export default async function PADashboard() {
  const user = await requireRole('PA')

  const assignments = await prisma.assignment.findMany({
    where: { paId: user.id, status: { in: ['PROPOSED', 'CONFIRMED'] } },
    include: {
      workshop: {
        include: {
          classSection: { include: { school: true } },
          cycle: { select: { name: true } },
        },
      },
    },
    orderBy: { workshop: { scheduledStart: { sort: 'asc', nulls: 'last' } } },
  })

  const now = new Date()
  const thisWeekAssignments = assignments.filter((a) => {
    if (!a.workshop.scheduledStart) return false
    const diff = a.workshop.scheduledStart.getTime() - now.getTime()
    return diff >= 0 && diff < 7 * 24 * 60 * 60 * 1000
  })

  const schools = new Set(
    assignments.map((a) => a.workshop.classSection.school.name)
  )

  // Check if any session is today
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: VANCOUVER_TZ })
  const todaySession = assignments.find((a) => {
    if (!a.workshop.scheduledStart) return false
    return a.workshop.scheduledStart.toLocaleDateString('en-CA', { timeZone: VANCOUVER_TZ }) === todayStr
  })

  const upcoming = assignments.filter(
    (a) => a.workshop.scheduledStart && a.workshop.scheduledStart > now
  )

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My assignments</h1>
        <p className="text-sm text-gray-500">Workshops you&apos;re facilitating.</p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <div className="flex size-10 items-center justify-center rounded-full bg-blue-100">
            <Calendar className="size-5 text-blue-600" />
          </div>
          <div>
            <p className="text-[10px] font-medium tracking-wide text-blue-500 uppercase">Assigned</p>
            <p className="text-2xl font-bold text-blue-900">{assignments.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-green-100 bg-green-50 p-4">
          <div className="flex size-10 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="size-5 text-green-600" />
          </div>
          <div>
            <p className="text-[10px] font-medium tracking-wide text-green-500 uppercase">This week</p>
            <p className="text-2xl font-bold text-green-900">{thisWeekAssignments.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50 p-4">
          <div className="flex size-10 items-center justify-center rounded-full bg-amber-100">
            <Clock className="size-5 text-amber-600" />
          </div>
          <div>
            <p className="text-[10px] font-medium tracking-wide text-amber-500 uppercase">Hours logged</p>
            <p className="text-2xl font-bold text-amber-900">
              {(assignments.filter((a) => a.workshop.status === 'COMPLETED').length * 1.5).toFixed(1)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-red-100 bg-red-50 p-4">
          <div className="flex size-10 items-center justify-center rounded-full bg-red-100">
            <School className="size-5 text-red-500" />
          </div>
          <div>
            <p className="text-[10px] font-medium tracking-wide text-red-500 uppercase">Schools</p>
            <p className="text-2xl font-bold text-red-900">{schools.size}</p>
          </div>
        </div>
      </div>

      {/* Upcoming schedule */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Upcoming schedule</h2>

        {upcoming.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">
            No upcoming assignments. Check back after a round is scheduled.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {upcoming.slice(0, 8).map((a) => {
              const ws = a.workshop
              const isToday =
                ws.scheduledStart &&
                ws.scheduledStart.toLocaleDateString('en-CA', { timeZone: VANCOUVER_TZ }) === todayStr

              return (
                <div
                  key={a.id}
                  className={`flex items-center justify-between py-4 ${isToday ? 'rounded-lg bg-[#1e2a4a]/5 px-4 -mx-4' : ''}`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`flex size-10 items-center justify-center rounded-full ${isToday ? 'bg-[#1e2a4a]' : 'bg-gray-100'}`}>
                      <Calendar className={`size-4 ${isToday ? 'text-white' : 'text-gray-500'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">{ws.classSection.name}</p>
                        {isToday && (
                          <span className="rounded bg-[#1e2a4a] px-1.5 py-0.5 text-[10px] font-bold text-white uppercase">
                            Today
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">
                        <Clock className="mr-1 inline size-3" />
                        {ws.scheduledStart ? formatInstant(ws.scheduledStart) : 'TBD'}
                        <span className="mx-1">·</span>
                        <School className="mr-0.5 inline size-3" />
                        {ws.classSection.school.name}
                      </p>
                    </div>
                  </div>
                  {isToday ? (
                    <a
                      href="/pa/checkin"
                      className="rounded-lg bg-[#1e2a4a] px-4 py-2 text-xs font-medium text-white hover:bg-[#2a3a5e]"
                    >
                      Check in
                    </a>
                  ) : (
                    <span className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600">
                      Check in
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
