import Link from 'next/link'
import { AvailabilityGrid } from '@/components/availability-grid'
import { PageHeader } from '@/components/ui/page-header'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { saveAvailabilityForm } from './actions'
export default async function PAAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>
}) {
  const user = await requireRole('PA')
  const { saved, error } = await searchParams
  const rows = await prisma.availability.findMany({
    where: { userId: user.id },
    select: { dayOfWeek: true, startMin: true },
  })
  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Program assistant"
        title="Weekly availability"
        description="Add the recurring times you can facilitate, then copy them to other weekdays."
        actions={
          <Link href="/pa" className="text-sm underline">
            Back to dashboard
          </Link>
        }
      />
      <AvailabilityGrid
        key={rows
          .map((r) => r.dayOfWeek + '-' + r.startMin)
          .sort()
          .join(',')}
        checked={new Set(rows.map((r) => r.dayOfWeek + '-' + r.startMin))}
        action={saveAvailabilityForm}
        saved={saved === '1'}
        error={error === '1'}
      />
    </main>
  )
}
