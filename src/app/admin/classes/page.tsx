import Link from 'next/link'
import { Pencil, Clock } from 'lucide-react'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { formatSlotRange } from '@/lib/time'

const DAY_COLORS = [
  'bg-red-50 text-red-600 border-red-200',
  'bg-amber-50 text-amber-600 border-amber-200',
  'bg-green-50 text-green-600 border-green-200',
  'bg-blue-50 text-blue-600 border-blue-200',
  'bg-purple-50 text-purple-600 border-purple-200',
]

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

function getTimeOfDay(startMinute: number): string {
  if (startMinute < 720) return 'Morning'
  if (startMinute < 780) return 'Midday'
  return 'Afternoon'
}

export default async function ClassesPage() {
  await requireRole('ADMIN')

  const classes = await prisma.classSection.findMany({
    where: { school: { deletedAt: null }, teacher: { deletedAt: null } },
    include: { teacher: true, school: true, meetings: true },
    orderBy: { name: 'asc' },
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Classes</h1>
          <p className="text-sm text-gray-500">
            A class plus the weekday + period it meets. This is the meeting time — availability slots live in the round.
          </p>
        </div>
        <Link
          href="/admin/classes/new"
          className="rounded-lg bg-[#1e2a4a] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a3a5e]"
        >
          + Add class
        </Link>
      </div>

      {/* Classes table */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
              <th className="pb-3 pr-4">Class</th>
              <th className="pb-3 pr-4">Teacher · School</th>
              <th className="pb-3 pr-4">Meets</th>
              <th className="pb-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {classes.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-sm text-gray-400">
                  No classes yet. Add your first class to get started.
                </td>
              </tr>
            )}
            {classes.map((cls) => (
              <tr key={cls.id} className="text-sm">
                <td className="py-4 pr-4">
                  <p className="font-medium text-gray-900">{cls.name}</p>
                  <p className="text-xs text-gray-400">C-{cls.id.slice(-3)}</p>
                </td>
                <td className="py-4 pr-4">
                  <p className="text-gray-700">{cls.teacher.name ?? cls.teacher.email}</p>
                  <p className="text-xs text-gray-400">{cls.school.name}</p>
                </td>
                <td className="py-4 pr-4">
                  {cls.meetings.length === 0 ? (
                    <span className="text-xs text-gray-300">No times set</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {cls.meetings.map((m) => (
                        <span
                          key={m.id}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${DAY_COLORS[m.dayOfWeek]}`}
                        >
                          {DAY_SHORT[m.dayOfWeek]}
                          <Clock className="size-3 opacity-60" />
                          {formatSlotRange(m.startMinute, m.endMinute - m.startMinute)}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="py-4">
                  <Link
                    href={`/admin/classes/${cls.id}/edit`}
                    className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  >
                    <Pencil className="size-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Meeting times overview */}
      {classes.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Meeting times overview</h2>
            <p className="text-xs text-gray-500">
              Each chip is a class&apos;s weekly meeting time — distinct from the round availability grid.
            </p>
          </div>

          <div className="grid grid-cols-5 gap-3">
            {[0, 1, 2, 3, 4].map((day) => {
              const dayMeetings = classes.flatMap((cls) =>
                cls.meetings
                  .filter((m) => m.dayOfWeek === day)
                  .map((m) => ({ className: cls.name, startMinute: m.startMinute }))
              )
              return (
                <div key={day} className={`rounded-xl border p-3 ${DAY_COLORS[day]}`}>
                  <p className="mb-2 text-xs font-bold">{DAY_SHORT[day]}</p>
                  {dayMeetings.length === 0 ? (
                    <p className="text-xs opacity-50">No classes</p>
                  ) : (
                    <div className="space-y-2">
                      {dayMeetings.map((m, i) => (
                        <div key={i}>
                          <p className="text-xs font-medium">{m.className}</p>
                          <p className="text-[10px] opacity-60">{getTimeOfDay(m.startMinute)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
