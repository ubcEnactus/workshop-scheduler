'use client'

import { useState, useTransition } from 'react'
import { DAY_LABELS_SHORT } from '@/lib/time'
import { getSlotDetailsAction } from './actions'

interface HeatmapCell {
  dayOfWeek: number
  startMin: number
  count: number
}

interface SlotPA {
  id: string
  name: string | null
  email: string
  community: string | null
}

interface HeatmapClientProps {
  cells: HeatmapCell[]
  slotStarts: number[]
  slotLabels: string[]
  schoolCommunity: string | null
}

function getCellColor(count: number, maxCount: number): string {
  if (count === 0) return 'bg-gray-100'
  const ratio = count / Math.max(maxCount, 1)
  if (ratio > 0.75) return 'bg-green-500 text-white'
  if (ratio > 0.5) return 'bg-green-400 text-white'
  if (ratio > 0.25) return 'bg-green-300'
  return 'bg-green-200'
}

export function HeatmapClient({ cells, slotStarts, slotLabels, schoolCommunity }: HeatmapClientProps) {
  const [selectedSlot, setSelectedSlot] = useState<{ day: number; startMin: number } | null>(null)
  const [slotPAs, setSlotPAs] = useState<SlotPA[]>([])
  const [isPending, startTransition] = useTransition()

  const maxCount = Math.max(...cells.map((c) => c.count), 1)
  const cellMap = new Map(cells.map((c) => [`${c.dayOfWeek}-${c.startMin}`, c.count]))

  function handleCellClick(day: number, startMin: number) {
    setSelectedSlot({ day, startMin })
    startTransition(async () => {
      const pas = await getSlotDetailsAction(day, startMin, schoolCommunity)
      setSlotPAs(pas)
    })
  }

  return (
    <div className="flex gap-6">
      {/* Grid */}
      <div className="flex-1 rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-4">
          <h2 className="text-lg font-semibold text-gray-900">Weekly grid</h2>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="inline-block size-3 rounded bg-gray-100" /> 0
            <span className="inline-block size-3 rounded bg-green-200" /> Low
            <span className="inline-block size-3 rounded bg-green-400" /> Med
            <span className="inline-block size-3 rounded bg-green-500" /> High
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr>
                <th className="w-16 py-2 text-left text-xs font-medium text-gray-400" />
                {DAY_LABELS_SHORT.map((day) => (
                  <th key={day} className="w-1/5 py-2 text-center text-xs font-semibold text-gray-700">
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slotStarts.map((startMin, i) => (
                <tr key={startMin}>
                  <td className="py-0.5 pr-2 text-right text-[11px] text-gray-400 tabular-nums">
                    {slotLabels[i]}
                  </td>
                  {[0, 1, 2, 3, 4].map((day) => {
                    const count = cellMap.get(`${day}-${startMin}`) ?? 0
                    const isSelected = selectedSlot?.day === day && selectedSlot?.startMin === startMin
                    return (
                      <td key={`${day}-${startMin}`} className="px-0.5 py-0.5">
                        <button
                          type="button"
                          onClick={() => handleCellClick(day, startMin)}
                          className={`flex h-7 w-full items-center justify-center rounded text-xs font-medium transition-all ${getCellColor(count, maxCount)} ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : 'hover:ring-1 hover:ring-gray-300'}`}
                        >
                          {count}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail panel */}
      <div className="w-72 shrink-0 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Slot details</h2>
        {!selectedSlot && (
          <p className="text-sm text-gray-400">Click a cell to see which PAs are available.</p>
        )}
        {selectedSlot && isPending && (
          <p className="text-sm text-gray-400">Loading...</p>
        )}
        {selectedSlot && !isPending && (
          <div>
            <p className="mb-3 text-xs font-medium text-gray-500">
              {DAY_LABELS_SHORT[selectedSlot.day]} at {slotLabels[slotStarts.indexOf(selectedSlot.startMin)]}
              {' \u2014 '}{slotPAs.length} PA{slotPAs.length !== 1 ? 's' : ''} available
            </p>
            {slotPAs.length === 0 ? (
              <p className="text-sm text-gray-400">No PAs available at this time.</p>
            ) : (
              <ul className="space-y-2">
                {slotPAs.map((pa) => (
                  <li key={pa.id} className="rounded-lg border border-gray-100 px-3 py-2">
                    <p className="text-sm font-medium text-gray-900">{pa.name ?? pa.email}</p>
                    <p className="text-xs text-gray-400">{pa.community ?? 'No community'}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
