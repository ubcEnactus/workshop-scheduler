import { Calendar, Clock, Users, AlertCircle } from 'lucide-react'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { SLOT_STARTS } from '@/lib/schemas/availability'
import { DAY_LABELS, formatSlotRange, formatInstant } from '@/lib/time'
import { StatusBadge } from '@/components/admin/status-badge'
import { saveAvailability } from './actions'

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

export default async function TeacherAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>
}) {
  const user = await requireRole('TEACHER')
  const { saved, error } = await searchParams

  const [rows, workshops, school] = await Promise.all([
    prisma.availability.findMany({
      where: { userId: user.id },
      select: { dayOfWeek: true, startMin: true },
    }),
    user.schoolId
      ? prisma.workshop.findMany({
          where: {
            classSection: { schoolId: user.schoolId },
            scheduledStart: { not: null },
            status: { in: ['SCHEDULED', 'CONFIRMED'] },
          },
          include: {
            classSection: { select: { name: true, grade: true } },
            assignments: {
              include: { pa: { select: { name: true, email: true } } },
            },
          },
          orderBy: { scheduledStart: 'asc' },
          take: 5,
        })
      : Promise.resolve([]),
    user.schoolId
      ? prisma.school.findUnique({
          where: { id: user.schoolId },
          select: { name: true },
        })
      : null,
  ])

  const checked = new Set(rows.map((r) => `${r.dayOfWeek}-${r.startMin}`))
  const slotCount = rows.length

  // Count upcoming workshops at this school
  const workshopCount = workshops.length
  const pasComing = new Set(workshops.flatMap((w) => w.assignments.map((a) => a.paId))).size

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My availability & workshops</h1>
        <p className="text-sm text-gray-500">
          Set when your classes can host a workshop, then see what&apos;s booked at{' '}
          {school?.name ?? 'your school'} and who&apos;s coming. Times in Vancouver (PT).
        </p>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex size-10 items-center justify-center rounded-full bg-blue-100">
            <Calendar className="size-5 text-blue-600" />
          </div>
          <div>
            <p className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">Workshops at school</p>
            <p className="text-xl font-bold text-gray-900">{workshopCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex size-10 items-center justify-center rounded-full bg-green-100">
            <Clock className="size-5 text-green-600" />
          </div>
          <div>
            <p className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">Available slots</p>
            <p className="text-xl font-bold text-gray-900">{slotCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex size-10 items-center justify-center rounded-full bg-amber-100">
            <Users className="size-5 text-amber-600" />
          </div>
          <div>
            <p className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">PAs coming</p>
            <p className="text-xl font-bold text-gray-900">{pasComing}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex size-10 items-center justify-center rounded-full bg-red-100">
            <AlertCircle className="size-5 text-red-500" />
          </div>
          <div>
            <p className="text-[10px] font-medium tracking-wide text-gray-400 uppercase">Awaiting PAs</p>
            <p className="text-xl font-bold text-gray-900">
              {workshops.filter((w) => w.assignments.length < 3).length}
            </p>
          </div>
        </div>
      </div>

      {/* Availability grid */}
      <form action={saveAvailability}>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Class availability</h2>
              <p className="text-xs text-gray-400">
                Mon–Fri · School hours (8:00 AM – 3:30 PM PT)
              </p>
            </div>
            <div className="flex items-center gap-4">
              {saved === '1' && (
                <span className="text-xs font-medium text-green-600">Saved</span>
              )}
              <span className="text-xs text-gray-400">{slotCount} slots selected</span>
            </div>
          </div>

          {error === '1' && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              Couldn&apos;t save — try again.
            </div>
          )}

          {/* Legend */}
          <div className="mb-3 flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded bg-green-400" /> Available
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded bg-gray-200" /> Not set
            </span>
          </div>

          <p className="mb-3 text-xs text-gray-400">
            Click to toggle the times you&apos;re available. Click a selected slot to remove it.
          </p>

          {/* Grid */}
          <div className="overflow-x-auto">
            <table className="w-full table-fixed border-collapse">
              <thead>
                <tr>
                  <th className="w-16 py-2 text-left text-xs font-medium text-gray-400" />
                  {DAY_SHORT.map((day) => (
                    <th key={day} className="w-1/5 py-2 text-center text-xs font-semibold text-gray-700">
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SLOT_STARTS.map((startMin) => (
                  <tr key={startMin}>
                    <td className="py-0.5 pr-2 text-right text-[11px] text-gray-400 tabular-nums">
                      {formatSlotRange(startMin).split('–')[0].trim()}
                    </td>
                    {[0, 1, 2, 3, 4].map((dayOfWeek) => {
                      const key = `${dayOfWeek}-${startMin}`
                      const isChecked = checked.has(key)
                      return (
                        <td key={key} className="px-0.5 py-0.5">
                          <label className="block cursor-pointer">
                            <input
                              type="checkbox"
                              name="slots"
                              value={key}
                              defaultChecked={isChecked}
                              className="peer sr-only"
                            />
                            <div className="h-7 rounded bg-gray-100 transition-colors hover:bg-gray-200 peer-checked:bg-green-400 peer-checked:hover:bg-green-500" />
                          </label>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Actions */}
          <div className="mt-4 flex items-center justify-end gap-3">
            <button
              type="reset"
              className="text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              Clear all
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[#1e2a4a] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a3a5e]"
            >
              Save availability
            </button>
          </div>
        </div>
      </form>

      {/* Workshops at school */}
      {workshops.length > 0 && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Workshops at {school?.name ?? 'your school'}
            </h2>
            <p className="text-xs text-gray-400">With the PAs assigned to each.</p>
          </div>

          <div className="divide-y divide-gray-100">
            {workshops.map((ws) => (
              <div key={ws.id} className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{ws.classSection.name}</p>
                    <p className="text-xs text-gray-400">
                      {ws.classSection.grade ? `Grade ${ws.classSection.grade}` : ''}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                      <Clock className="size-3" />
                      {ws.scheduledStart ? formatInstant(ws.scheduledStart) : 'TBD'}
                    </p>
                  </div>
                  <StatusBadge status={ws.status} />
                </div>
                {ws.assignments.length > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    {ws.assignments.map((a) => (
                      <div
                        key={a.paId}
                        className="flex size-7 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700"
                        title={a.pa.name ?? a.pa.email}
                      >
                        {(a.pa.name ?? a.pa.email).slice(0, 2).toUpperCase()}
                      </div>
                    ))}
                    <span className="text-xs text-gray-400">
                      {ws.assignments.map((a) => a.pa.name ?? a.pa.email).join(', ')}
                    </span>
                  </div>
                )}
                {ws.assignments.length === 0 && (
                  <p className="mt-2 flex items-center gap-1 text-xs text-red-500">
                    <AlertCircle className="size-3" />
                    No PAs assigned yet
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
