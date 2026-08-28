import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { SLOT_STARTS } from '@/lib/schemas/availability'
import { getAvailabilityHeatmap } from '@/lib/scheduling/heatmap'
import { formatSlotRange } from '@/lib/time'
import { HeatmapClient } from './HeatmapClient'

export default async function HeatmapPage({
  searchParams,
}: {
  searchParams: Promise<{ school?: string }>
}) {
  await requireRole('ADMIN')
  const { school: schoolCommunity } = await searchParams

  const [cells, schools] = await Promise.all([
    getAvailabilityHeatmap(schoolCommunity || null),
    prisma.school.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, community: true },
      orderBy: { name: 'asc' },
    }),
  ])

  const slotLabels = SLOT_STARTS.map((m) => formatSlotRange(m).split('\u2013')[0].trim())

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">PA availability heatmap</h1>
        <p className="text-sm text-gray-500">
          See how many PAs are available at each time slot. Filter by school community to see who can commute there.
        </p>
      </div>

      {/* School filter */}
      <form className="mb-6 flex items-center gap-3">
        <label htmlFor="school" className="text-sm font-medium text-gray-700">
          Filter by school community:
        </label>
        <select
          id="school"
          name="school"
          defaultValue={schoolCommunity ?? ''}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
        >
          <option value="">All communities</option>
          {[...new Set(schools.map((s) => s.community).filter(Boolean))].map((c) => (
            <option key={c} value={c!}>{c}</option>
          ))}
        </select>
        <button type="submit" className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">
          Apply
        </button>
      </form>

      <HeatmapClient
        cells={cells}
        slotStarts={SLOT_STARTS}
        slotLabels={slotLabels}
        schoolCommunity={schoolCommunity ?? null}
      />
    </div>
  )
}
