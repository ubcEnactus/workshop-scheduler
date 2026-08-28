import { Calendar, Clock, School, CheckCircle2 } from 'lucide-react'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { formatInstant } from '@/lib/time'
import { AvailabilityGrid } from '@/components/availability-grid'
import { StatusBadge } from '@/components/ui/status-badge'
import { saveAvailability } from './actions'

export default async function PAAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>
}) {
  const user = await requireRole('PA')
  const { saved, error } = await searchParams

  const [rows, assignments] = await Promise.all([
    prisma.availability.findMany({
      where: { userId: user.id },
      select: { dayOfWeek: true, startMin: true },
    }),
    prisma.assignment.findMany({
      where: { paId: user.id, status: { in: ['PROPOSED', 'CONFIRMED'] } },
      include: {
        workshop: {
          include: {
            classSection: { include: { school: true } },
          },
        },
      },
      orderBy: { workshop: { scheduledStart: { sort: 'asc', nulls: 'last' } } },
    }),
  ])

  const checked = new Set(rows.map((r) => `${r.dayOfWeek}-${r.startMin}`))
  const slotCount = rows.length

  const uniqueSchools = new Set(
    assignments.map((a) => a.workshop.classSection.school.name)
  )

  const now = new Date()
  const thisWeek = assignments.filter((a) => {
    if (!a.workshop.scheduledStart) return false
    const diff = a.workshop.scheduledStart.getTime() - now.getTime()
    return diff >= 0 && diff < 7 * 24 * 60 * 60 * 1000
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My availability & workshops</h1>
        <p className="text-sm text-gray-500">
          Set the times you can facilitate, then see what you&apos;ve been assigned. All times shown in Vancouver (PT).
        </p>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <div className="flex size-10 items-center justify-center rounded-full bg-blue-100">
            <Calendar className="size-5 text-blue-600" />
          </div>
          <div>
            <p className="text-[10px] font-medium tracking-wide text-blue-500 uppercase">Assigned workshops</p>
            <p className="text-2xl font-bold text-blue-900">{assignments.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-green-100 bg-green-50 p-4">
          <div className="flex size-10 items-center justify-center rounded-full bg-green-100">
            <Clock className="size-5 text-green-600" />
          </div>
          <div>
            <p className="text-[10px] font-medium tracking-wide text-green-500 uppercase">Available slots</p>
            <p className="text-2xl font-bold text-green-900">{slotCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50 p-4">
          <div className="flex size-10 items-center justify-center rounded-full bg-amber-100">
            <School className="size-5 text-amber-600" />
          </div>
          <div>
            <p className="text-[10px] font-medium tracking-wide text-amber-500 uppercase">Schools</p>
            <p className="text-2xl font-bold text-amber-900">{uniqueSchools.size}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-purple-100 bg-purple-50 p-4">
          <div className="flex size-10 items-center justify-center rounded-full bg-purple-100">
            <CheckCircle2 className="size-5 text-purple-600" />
          </div>
          <div>
            <p className="text-[10px] font-medium tracking-wide text-purple-500 uppercase">This week</p>
            <p className="text-2xl font-bold text-purple-900">{thisWeek.length}</p>
          </div>
        </div>
      </div>

      {/* Weekly availability grid */}
      <AvailabilityGrid
        checked={checked}
        action={saveAvailability}
        title="Weekly availability"
        subtitle="Mon–Fri · school hours (8:30 AM – 3:00 PM PT)"
        helpText="Click the times you’re available. Click a selected slot to remove it."
        saved={saved === '1'}
        error={error === '1'}
        legendExtra={
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded bg-blue-200" /> Booked by school
          </span>
        }
      />

      {/* Your assignments */}
      {assignments.length > 0 && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Your assignments</h2>
            <p className="text-xs text-gray-400">Workshops you&apos;re facilitating.</p>
          </div>

          <div className="divide-y divide-gray-100">
            {assignments.slice(0, 6).map((a) => {
              const ws = a.workshop
              return (
                <div key={a.id} className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{ws.classSection.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          {ws.scheduledStart ? formatInstant(ws.scheduledStart) : 'TBD'}
                        </span>
                        <span className="flex items-center gap-1">
                          <School className="size-3" />
                          {ws.classSection.school.name}
                        </span>
                      </div>
                    </div>
                    <StatusBadge status={a.status === 'CONFIRMED' ? 'confirmed' : 'pending'} label={a.status === 'CONFIRMED' ? 'Scheduled' : 'Pending'} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
