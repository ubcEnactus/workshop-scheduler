import { Calendar, CheckCircle2, Clock, AlertCircle, MapPin, School } from 'lucide-react'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { formatInstant, VANCOUVER_TZ } from '@/lib/time'
import { StatusBadge } from '@/components/admin/status-badge'

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

const DAY_COLORS = [
  { header: 'bg-[#1e2a4a] text-white', border: 'border-[#1e2a4a]' },
  { header: 'bg-amber-400 text-[#1e2a4a]', border: 'border-amber-400' },
  { header: 'bg-gray-200 text-gray-700', border: 'border-gray-200' },
  { header: 'bg-green-500 text-white', border: 'border-green-500' },
  { header: 'bg-purple-500 text-white', border: 'border-purple-500' },
]

function getWeekDates(): { dates: Date[]; label: string } {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))

  const dates = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })

  const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
  const label = `Week of ${fmt.format(monday)} · This week`
  return { dates, label }
}

function formatShortDate(d: Date): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d)
}

function formatTime(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: VANCOUVER_TZ,
    hour: 'numeric',
    minute: '2-digit',
  }).format(d)
}

export default async function PASchedulePage() {
  const user = await requireRole('PA')

  const assignments = await prisma.assignment.findMany({
    where: { paId: user.id, status: { in: ['PROPOSED', 'CONFIRMED'] } },
    include: {
      workshop: {
        include: {
          classSection: { include: { school: true } },
        },
      },
    },
    orderBy: { workshop: { scheduledStart: { sort: 'asc', nulls: 'last' } } },
  })

  const { dates, label } = getWeekDates()
  const now = new Date()

  // Group assignments by day of week for the current week
  const weekAssignments = assignments.filter((a) => {
    if (!a.workshop.scheduledStart) return false
    const ws = a.workshop.scheduledStart
    return dates.some(
      (d) =>
        d.getFullYear() === ws.getFullYear() &&
        d.getMonth() === ws.getMonth() &&
        d.getDate() === ws.getDate()
    )
  })

  const byDay: Map<number, typeof weekAssignments> = new Map()
  for (const a of weekAssignments) {
    if (!a.workshop.scheduledStart) continue
    const wsDate = a.workshop.scheduledStart
    const dayIdx = dates.findIndex(
      (d) =>
        d.getFullYear() === wsDate.getFullYear() &&
        d.getMonth() === wsDate.getMonth() &&
        d.getDate() === wsDate.getDate()
    )
    if (dayIdx === -1) continue
    const existing = byDay.get(dayIdx) ?? []
    existing.push(a)
    byDay.set(dayIdx, existing)
  }

  const sessionsThisWeek = weekAssignments.length
  const confirmedCount = weekAssignments.filter((a) => a.status === 'CONFIRMED').length
  const pendingCount = weekAssignments.filter((a) => a.status === 'PROPOSED').length
  const travelDays = byDay.size

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
          <p className="text-sm text-gray-500">A week-at-a-glance of your workshop assignments.</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
          <span className="text-xs font-medium text-gray-700">{label}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <div className="flex size-10 items-center justify-center rounded-full bg-blue-100">
            <Calendar className="size-5 text-blue-600" />
          </div>
          <div>
            <p className="text-[10px] font-medium tracking-wide text-blue-500 uppercase">Sessions this week</p>
            <p className="text-2xl font-bold text-blue-900">{sessionsThisWeek}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-green-100 bg-green-50 p-4">
          <div className="flex size-10 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="size-5 text-green-600" />
          </div>
          <div>
            <p className="text-[10px] font-medium tracking-wide text-green-500 uppercase">Confirmed</p>
            <p className="text-2xl font-bold text-green-900">{confirmedCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50 p-4">
          <div className="flex size-10 items-center justify-center rounded-full bg-amber-100">
            <AlertCircle className="size-5 text-amber-600" />
          </div>
          <div>
            <p className="text-[10px] font-medium tracking-wide text-amber-500 uppercase">Pending</p>
            <p className="text-2xl font-bold text-amber-900">{pendingCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-red-100 bg-red-50 p-4">
          <div className="flex size-10 items-center justify-center rounded-full bg-red-100">
            <MapPin className="size-5 text-red-500" />
          </div>
          <div>
            <p className="text-[10px] font-medium tracking-wide text-red-500 uppercase">Travel days</p>
            <p className="text-2xl font-bold text-red-900">{travelDays}</p>
          </div>
        </div>
      </div>

      {/* Weekly day cards */}
      <div className="mb-6 grid grid-cols-5 gap-3">
        {dates.map((date, dayIdx) => {
          const dayAssignments = byDay.get(dayIdx) ?? []
          const color = DAY_COLORS[dayIdx]
          return (
            <div key={dayIdx} className={`rounded-xl border ${color.border} bg-white overflow-hidden`}>
              <div className={`px-3 py-2 ${color.header}`}>
                <p className="text-xs font-bold uppercase">{DAY_SHORT[dayIdx]}</p>
                <p className="text-sm font-semibold">{formatShortDate(date)}</p>
              </div>
              <div className="min-h-[120px] p-2">
                {dayAssignments.length === 0 ? (
                  <p className="py-6 text-center text-xs text-gray-300">No sessions</p>
                ) : (
                  <div className="space-y-2">
                    {dayAssignments.map((a) => (
                      <div key={a.id} className="rounded-lg border border-gray-100 p-2">
                        <div className="flex items-start justify-between">
                          <p className="text-[10px] font-medium text-gray-500">
                            {a.workshop.scheduledStart ? formatTime(a.workshop.scheduledStart) : ''}
                          </p>
                          <StatusBadge status={a.status === 'CONFIRMED' ? 'confirmed' : 'pending'} />
                        </div>
                        <p className="mt-1 text-xs font-semibold text-gray-900 leading-tight">
                          {a.workshop.classSection.name}
                        </p>
                        <p className="mt-0.5 flex items-center gap-0.5 text-[10px] text-gray-400">
                          <MapPin className="size-2.5" />
                          {a.workshop.classSection.school.name}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* All this week list */}
      {weekAssignments.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">All this week</h2>

          <div className="divide-y divide-gray-100">
            {weekAssignments.map((a) => {
              const ws = a.workshop
              return (
                <div key={a.id} className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-4">
                    <div className="flex size-10 items-center justify-center rounded-full bg-gray-100">
                      <Calendar className="size-4 text-gray-500" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{ws.classSection.name}</p>
                      <p className="text-xs text-gray-400">
                        <Clock className="mr-1 inline size-3" />
                        {ws.scheduledStart ? formatInstant(ws.scheduledStart) : 'TBD'}
                        <span className="mx-1">·</span>
                        <School className="mr-0.5 inline size-3" />
                        {ws.classSection.school.name}
                      </p>
                    </div>
                  </div>
                  <button className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">
                    Open brief
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
