import Link from 'next/link'

import { AvailabilityGrid } from '@/components/availability-grid'
import { Panel } from '@/components/ui/panel'
import { prisma } from '@/lib/db'
import { vancouverDateKey } from '@/lib/time'
import {
  removeAvailabilityExceptionForm,
  saveAvailabilityExceptionForm,
  saveAvailabilityForm,
} from '@/app/pa/availability/actions'
import { savePAAvailability, savePAException, removePAException } from '@/app/admin/pas/availability-actions'
import { availabilityRevision } from '@/lib/availability'

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

export async function PAScheduleEditor({ userId, basePath, admin = false, query }: {
  userId: string
  basePath: string
  admin?: boolean
  query: { saved?: string; error?: string; effectiveFrom?: string }
}) {
  const { saved, error, effectiveFrom: requestedDate } = query
  const revision = await availabilityRevision(prisma,userId)
  const today = vancouverDateKey(new Date())
  const versions = await prisma.availabilityScheduleVersion.findMany({
    where: { userId: userId },
    orderBy: { effectiveFrom: 'asc' },
    select: { effectiveFrom: true, effectiveUntil: true },
  })
  const exactRequested = versions.find(
    (version) => dateKey(version.effectiveFrom) === requestedDate
  )
  const activeVersion = [...versions]
    .reverse()
    .find(
      (version) =>
        dateKey(version.effectiveFrom) <= today &&
        (!version.effectiveUntil || dateKey(version.effectiveUntil) >= today)
    )
  const selectedVersion = exactRequested ?? activeVersion ?? versions.at(-1)
  const selectedDate = selectedVersion ? dateKey(selectedVersion.effectiveFrom) : today
  const saveDate = selectedDate >= today ? selectedDate : today
  const [rows, exceptions] = await Promise.all([
    prisma.availability.findMany({
      where: {
        userId: userId,
        ...(versions.length
          ? { effectiveFrom: new Date(`${selectedDate}T00:00:00.000Z`) }
          : {
              effectiveFrom: { lte: new Date(`${today}T00:00:00.000Z`) },
              OR: [
                { effectiveUntil: null },
                { effectiveUntil: { gte: new Date(`${today}T00:00:00.000Z`) } },
              ],
            }),
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startMin: 'asc' }],
      select: { dayOfWeek: true, startMin: true },
    }),
    prisma.pAAvailabilityException.findMany({
      where: { userId: userId, date: { gte: new Date(`${today}T00:00:00.000Z`) } },
      orderBy: [{ date: 'asc' }, { startMinute: 'asc' }],
      select: {
        id: true,
        date: true,
        kind: true,
        startMinute: true,
        endMinute: true,
        notes: true,
      },
    }),
  ])

  return (
    <div className="space-y-6">
      <Panel
        title="Schedules"
      >
        <nav aria-label="Availability schedule versions" className="flex flex-wrap gap-2">
          {versions.map((version) => {
            const from = dateKey(version.effectiveFrom)
            const until = version.effectiveUntil ? dateKey(version.effectiveUntil) : null
            const selected = from === selectedDate
            return (
              <Link
                key={from}
                href={`${basePath}?effectiveFrom=${from}`}
                aria-current={selected ? 'page' : undefined}
                className={`rounded-lg border px-3 py-2 text-sm ${selected ? 'border-blue-600 bg-blue-50 font-semibold text-blue-950' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'}`}
              >
                From {from}
                <span className="block text-xs font-normal text-slate-500">
                  {until ? `through ${until}` : 'current or upcoming'}
                </span>
              </Link>
            )
          })}
          {!versions.length && (
            <p className="text-sm text-slate-500">
              No schedule saved yet.
            </p>
          )}
        </nav>
        {selectedVersion && !rows.length && (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
            This version records no recurring availability.
          </p>
        )}
      </Panel>
      <AvailabilityGrid
        key={`${selectedDate}:${rows.map((row) => `${row.dayOfWeek}-${row.startMin}`).join(',')}`}
        checked={new Set(rows.map((row) => `${row.dayOfWeek}-${row.startMin}`))}
        action={admin ? savePAAvailability.bind(null,userId,revision) : saveAvailabilityForm}
        expectedRevision={revision}
        effectiveFrom={saveDate}
        minimumEffectiveFrom={today}
        exceptions={exceptions.map((item) => ({
          ...item,
          date: dateKey(item.date),
        }))}
        exceptionAction={admin ? savePAException.bind(null,userId,revision) : saveAvailabilityExceptionForm}
        removeExceptionAction={admin ? removePAException.bind(null,userId,revision) : removeAvailabilityExceptionForm}
        saved={saved === '1' && requestedDate === selectedDate}
        error={error === '1'}
      />
    </div>
  )
}
