import { Clock, Calendar } from 'lucide-react'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { formatInstant, DAY_LABELS_SHORT, VANCOUVER_TZ } from '@/lib/time'
import { getCurrentWeekDates, formatMonthDay } from '@/lib/week-grid'
import { StatusBadge } from '@/components/ui/status-badge'

const HOUR_START = 8
const HOUR_END = 16
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)

const BLOCK_COLORS = [
  { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' },
  { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
  { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
  { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200' },
  { bg: 'bg-teal-100', text: 'text-teal-700', border: 'border-teal-200' },
]

function getBlockColor(index: number) {
  return BLOCK_COLORS[index % BLOCK_COLORS.length]
}

export default async function TeacherSchedulePage() {
  const user = await requireRole('TEACHER')

  const workshops = user.schoolId
    ? await prisma.workshop.findMany({
        where: {
          classSection: { schoolId: user.schoolId },
          scheduledStart: { not: null },
          status: { in: ['SCHEDULED', 'CONFIRMED', 'COMPLETED'] },
        },
        include: {
          classSection: { select: { name: true, grade: true, subject: true } },
        },
        orderBy: { scheduledStart: 'asc' },
      })
    : []

  const { dates, label } = getCurrentWeekDates()

  // Map workshops to calendar blocks
  type CalendarBlock = {
    id: string
    className: string
    grade: string | null
    dayOfWeek: number
    startHour: number
    startMinute: number
    durationMinutes: number
    colorIndex: number
  }

  const blocks: CalendarBlock[] = []
  workshops.forEach((ws, i) => {
    if (!ws.scheduledStart || !ws.scheduledEnd) return

    // Convert to Vancouver time
    const start = new Date(
      ws.scheduledStart.toLocaleString('en-US', { timeZone: VANCOUVER_TZ })
    )
    const end = new Date(
      ws.scheduledEnd.toLocaleString('en-US', { timeZone: VANCOUVER_TZ })
    )

    // Check if this workshop is in the current week
    const wsDate = ws.scheduledStart
    const inWeek = dates.some(
      (d) =>
        d.getFullYear() === wsDate.getFullYear() &&
        d.getMonth() === wsDate.getMonth() &&
        d.getDate() === wsDate.getDate()
    )

    if (!inWeek) {
      // Also add if it's a recurring class meeting in this week (by dayOfWeek)
      // For now, show all scheduled workshops regardless of week
    }

    const startHour = start.getHours()
    const startMin = start.getMinutes()
    const durationMinutes = (end.getTime() - start.getTime()) / 60000
    const dayOfWeek = start.getDay() - 1 // 0=Mon

    if (dayOfWeek < 0 || dayOfWeek > 4) return

    blocks.push({
      id: ws.id,
      className: ws.classSection.name,
      grade: ws.classSection.grade,
      dayOfWeek,
      startHour,
      startMinute: startMin,
      durationMinutes: Math.min(durationMinutes, 120),
      colorIndex: i,
    })
  })

  // Upcoming sessions list
  const upcoming = workshops
    .filter((w) => w.scheduledStart && w.scheduledStart >= new Date())
    .slice(0, 3)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
          <p className="text-sm text-gray-500">Your weekly view of workshops and prep blocks.</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
          <span className="text-xs font-medium text-gray-700">{label}</span>
        </div>
      </div>

      {/* Weekly calendar */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="grid grid-cols-[60px_repeat(5,1fr)] gap-0">
          {/* Header */}
          <div className="border-b border-gray-100 pb-3" />
          {dates.map((d, i) => (
            <div key={i} className="border-b border-gray-100 pb-3 text-center">
              <p className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">
                {DAY_LABELS_SHORT[i]}
              </p>
              <p className="text-sm font-semibold text-gray-900">{formatMonthDay(d)}</p>
            </div>
          ))}

          {/* Time rows */}
          {HOURS.map((hour) => (
            <div key={hour} className="contents">
              <div className="flex h-16 items-start justify-end pr-2 pt-0.5">
                <span className="text-[11px] text-gray-400 tabular-nums">
                  {hour}:00
                </span>
              </div>
              {[0, 1, 2, 3, 4].map((day) => {
                const block = blocks.find(
                  (b) => b.dayOfWeek === day && b.startHour === hour
                )
                return (
                  <div
                    key={day}
                    className="relative h-16 border-t border-l border-gray-50"
                  >
                    {block && (
                      <div
                        className={`absolute inset-x-1 top-0 rounded-md border p-1.5 ${getBlockColor(block.colorIndex).bg} ${getBlockColor(block.colorIndex).border}`}
                        style={{
                          top: `${(block.startMinute / 60) * 100}%`,
                          height: `${Math.max((block.durationMinutes / 60) * 64, 32)}px`,
                        }}
                      >
                        <p className={`text-xs font-semibold leading-tight ${getBlockColor(block.colorIndex).text}`}>
                          {block.className}
                        </p>
                        <p className={`text-[10px] ${getBlockColor(block.colorIndex).text} opacity-70`}>
                          {block.grade ? `Grade ${block.grade}` : ''}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Up next */}
      {upcoming.length > 0 && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Up next</h2>
              <p className="text-xs text-gray-400">Your next {upcoming.length} sessions in detail.</p>
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {upcoming.map((ws, i) => (
              <div key={ws.id} className="flex items-center justify-between py-4">
                <div className="flex items-center gap-4">
                  <div
                    className={`flex size-10 items-center justify-center rounded-full ${getBlockColor(i).bg}`}
                  >
                    <Calendar className={`size-4 ${getBlockColor(i).text}`} />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{ws.classSection.name}</p>
                    <p className="text-xs text-gray-400">
                      <Clock className="mr-1 inline size-3" />
                      {ws.scheduledStart ? formatInstant(ws.scheduledStart) : 'TBD'}
                      {ws.classSection.grade ? ` · Grade ${ws.classSection.grade}` : ''}
                      {ws.classSection.subject ? ` ${ws.classSection.subject}` : ''}
                    </p>
                  </div>
                </div>
                <StatusBadge status={ws.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
