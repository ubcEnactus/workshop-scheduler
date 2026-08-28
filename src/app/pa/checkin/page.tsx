import { MapPin, Clock, Users, Camera, QrCode, ClipboardList, AlertTriangle, CheckCircle2 } from 'lucide-react'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { formatInstant, VANCOUVER_TZ } from '@/lib/time'
import { StatusBadge } from '@/components/admin/status-badge'

function formatTime(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: VANCOUVER_TZ,
    hour: 'numeric',
    minute: '2-digit',
  }).format(d)
}

export default async function PACheckinPage() {
  const user = await requireRole('PA')

  const now = new Date()
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: VANCOUVER_TZ })

  const assignments = await prisma.assignment.findMany({
    where: { paId: user.id, status: { in: ['PROPOSED', 'CONFIRMED'] } },
    include: {
      workshop: {
        include: {
          classSection: { include: { school: true } },
        },
      },
    },
    orderBy: { workshop: { scheduledStart: 'asc' } },
  })

  // Filter today's sessions
  const todaySessions = assignments.filter((a) => {
    if (!a.workshop.scheduledStart) return false
    return a.workshop.scheduledStart.toLocaleDateString('en-CA', { timeZone: VANCOUVER_TZ }) === todayStr
  })

  // The "current" session is the first today that hasn't passed
  const currentSession = todaySessions.find((a) => {
    if (!a.workshop.scheduledEnd) return true
    return a.workshop.scheduledEnd > now
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Check-in</h1>
        <p className="text-sm text-gray-500">Mark yourself on-site for a workshop and capture attendance.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        <div>
          {/* Current/next session card */}
          {currentSession ? (
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-700 uppercase">
                <div className="size-2 rounded-full bg-amber-500 animate-pulse" />
                Now arriving
              </div>
              <h2 className="mt-2 text-xl font-bold text-gray-900">
                {currentSession.workshop.classSection.name}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {currentSession.workshop.classSection.school.name}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="size-3.5" />
                  {currentSession.workshop.scheduledStart
                    ? `Today, ${formatTime(currentSession.workshop.scheduledStart)}`
                    : 'TBD'}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="size-3.5" />
                  24 students
                </span>
              </div>

              {/* Check in action */}
              <div className="mt-4 flex items-center justify-between rounded-lg bg-white p-4 border border-amber-200">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-full bg-amber-100">
                    <MapPin className="size-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Upcoming</p>
                    <p className="text-xs text-gray-400">Tap &quot;Check in&quot; when you arrive on-site</p>
                  </div>
                </div>
                <button className="rounded-lg bg-[#1e2a4a] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#2a3a5e]">
                  Check in
                </button>
              </div>

              {/* Quick actions */}
              <div className="mt-4 grid grid-cols-3 gap-3">
                <button className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 text-center hover:bg-gray-50">
                  <QrCode className="size-5 text-gray-500" />
                  <span className="text-xs font-medium text-gray-700">Scan QR</span>
                  <span className="text-[10px] text-gray-400">Scan room code</span>
                </button>
                <button className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 text-center hover:bg-gray-50">
                  <ClipboardList className="size-5 text-gray-500" />
                  <span className="text-xs font-medium text-gray-700">Attendance</span>
                  <span className="text-[10px] text-gray-400">Mark students</span>
                </button>
                <button className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 text-center hover:bg-gray-50">
                  <Camera className="size-5 text-gray-500" />
                  <span className="text-xs font-medium text-gray-700">Photo log</span>
                  <span className="text-[10px] text-gray-400">Capture moment</span>
                </button>
              </div>

              {/* Pre-session checklist */}
              <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="mb-3 text-sm font-semibold text-gray-900">Pre-session checklist</h3>
                <div className="space-y-2">
                  {[
                    { label: 'Workshop kit packed', done: true },
                    { label: 'Slides downloaded for offline', done: true },
                    { label: 'Confirm room access with teacher', done: false },
                    { label: 'Set up projector & test mic', done: false },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className={`flex size-5 items-center justify-center rounded-full ${item.done ? 'bg-green-100' : 'bg-gray-100'}`}>
                        {item.done ? (
                          <CheckCircle2 className="size-3 text-green-600" />
                        ) : (
                          <div className="size-2 rounded-full bg-gray-300" />
                        )}
                      </div>
                      <span className={`text-sm ${item.done ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* GPS note */}
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                <p className="text-xs text-amber-800">
                  GPS check-in opens within 100m of{' '}
                  <span className="font-semibold">{currentSession.workshop.classSection.school.name}</span>.
                  If you can&apos;t auto-locate, use the QR fallback.
                </p>
              </div>
            </div>
          ) : (
            <div className="mb-6 rounded-xl border border-gray-200 bg-white p-8 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-gray-100">
                <CheckCircle2 className="size-6 text-gray-400" />
              </div>
              <h2 className="mt-3 text-lg font-semibold text-gray-900">No sessions right now</h2>
              <p className="mt-1 text-sm text-gray-400">
                {todaySessions.length > 0
                  ? `You have ${todaySessions.length} session${todaySessions.length > 1 ? 's' : ''} later today.`
                  : 'No sessions scheduled for today. Enjoy your day off!'}
              </p>
            </div>
          )}
        </div>

        {/* Today's queue sidebar */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-1 text-sm font-semibold text-gray-900">Today&apos;s queue</h3>
          <p className="mb-4 text-xs text-gray-400">Tap a session to switch focus.</p>

          {todaySessions.length === 0 ? (
            <p className="py-6 text-center text-xs text-gray-300">No sessions today.</p>
          ) : (
            <div className="space-y-3">
              {todaySessions.map((a) => {
                const ws = a.workshop
                const isPast = ws.scheduledEnd && ws.scheduledEnd < now
                return (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-lg border border-gray-100 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`flex size-7 items-center justify-center rounded-full ${isPast ? 'bg-green-100' : 'bg-purple-100'}`}>
                        <span className={`text-[10px] font-bold ${isPast ? 'text-green-600' : 'text-purple-600'}`}>
                          {(ws.classSection.name).slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-900 leading-tight">
                          {ws.classSection.name.length > 14
                            ? ws.classSection.name.slice(0, 14) + '…'
                            : ws.classSection.name}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {ws.classSection.school.name.length > 16
                            ? ws.classSection.school.name.slice(0, 16) + '…'
                            : ws.classSection.school.name}
                        </p>
                      </div>
                    </div>
                    <StatusBadge
                      status={isPast ? 'confirmed' : 'pending'}
                      label={isPast ? 'Completed' : 'Upcoming'}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
