import { CalendarOff, Trash2 } from 'lucide-react'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { addBlockedDate, removeBlockedDate } from './actions'

export default async function BlockedDatesPage() {
  await requireRole('ADMIN')

  const [blockedDates, schools] = await Promise.all([
    prisma.blockedDate.findMany({
      include: { school: { select: { name: true } } },
      orderBy: { date: 'asc' },
    }),
    prisma.school.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Blocked dates</h1>
        <p className="text-sm text-gray-500">
          Holidays, pro-D days, and training days. The scheduler will not place workshops on these dates.
        </p>
      </div>

      {/* Add form */}
      <form action={addBlockedDate} className="mb-8 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Add a blocked date</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <label htmlFor="date" className="mb-1 block text-xs font-medium text-gray-500">
              Date
            </label>
            <input
              type="date"
              id="date"
              name="date"
              required
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="schoolId" className="mb-1 block text-xs font-medium text-gray-500">
              School (optional)
            </label>
            <select
              id="schoolId"
              name="schoolId"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="">All schools (global)</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="reason" className="mb-1 block text-xs font-medium text-gray-500">
              Reason
            </label>
            <input
              type="text"
              id="reason"
              name="reason"
              placeholder="e.g. Pro-D Day"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="rounded-lg bg-[#1e2a4a] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a3a5e]"
            >
              Add date
            </button>
          </div>
        </div>
      </form>

      {/* List */}
      {blockedDates.length === 0 ? (
        <div className="py-12 text-center">
          <CalendarOff className="mx-auto size-12 text-gray-300" />
          <p className="mt-4 text-sm text-gray-500">No blocked dates yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">School</th>
                <th className="px-5 py-3">Reason</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {blockedDates.map((bd) => (
                <tr key={bd.id}>
                  <td className="px-5 py-3 text-sm font-medium text-gray-900">
                    {bd.date.toISOString().slice(0, 10)}
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-600">
                    {bd.school?.name ?? 'All schools'}
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-500">
                    {bd.reason ?? '�'}
                  </td>
                  <td className="px-5 py-3">
                    <form action={removeBlockedDate}>
                      <input type="hidden" name="id" value={bd.id} />
                      <button
                        type="submit"
                        className="rounded p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        aria-label="Remove blocked date"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
