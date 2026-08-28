import Link from 'next/link'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { CycleGrid } from '@/components/admin/cycle-grid'
import { openCycleClient, closeCycleClient, deleteCycleClient } from './actions'

export default async function CyclesPage() {
  await requireRole('ADMIN')

  const cycles = await prisma.cycle.findMany({
    include: {
      _count: { select: { workshops: true } },
    },
    orderBy: { startDate: 'desc' },
  })

  const classCount = await prisma.classSection.count({
    where: { school: { deletedAt: null }, teacher: { deletedAt: null } },
  })

  const cycleData = cycles.map((c) => ({
    id: c.id,
    name: c.name,
    startDate: c.startDate.toISOString(),
    endDate: c.endDate.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    createdAt: c.createdAt.toISOString(),
    status: c.status,
    workshopCount: c._count.workshops,
  }))

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scheduling rounds</h1>
          <p className="text-sm text-gray-500">
            Create rounds as drafts, then open them to generate one empty workshop per class.
          </p>
        </div>
        <Link
          href="/admin/cycles/new"
          className="rounded-lg bg-[#1e2a4a] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a3a5e]"
        >
          + New round
        </Link>
      </div>

      <CycleGrid
        cycles={cycleData}
        classCount={classCount}
        openCycleAction={openCycleClient}
        closeCycleAction={closeCycleClient}
        deleteCycleAction={deleteCycleClient}
      />
    </div>
  )
}
