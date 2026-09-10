import Link from 'next/link'
import { ArrowLeft, CalendarDays, Clock3, Grid3X3 } from 'lucide-react'

import { AvailabilityGrid } from '@/components/availability-grid'
import { buttonClasses } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'

import { saveAvailability } from './actions'

type SearchParams = Promise<{ saved?: string; error?: string }>

export default async function PAAvailabilityPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireRole('PA')
  const { saved, error } = await searchParams

  const rows = await prisma.availability.findMany({
    where: { userId: user.id },
    select: { dayOfWeek: true, startMin: true },
  })
  const checked = new Set(rows.map((row) => `${row.dayOfWeek}-${row.startMin}`))
  const availableDays = new Set(rows.map((row) => row.dayOfWeek)).size

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Program assistant"
        title="Weekly availability"
        description="Choose the recurring school-hour blocks when you can facilitate. Admins use this schedule when assigning dated workshops."
        actions={
          <Link href="/pa" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to dashboard
          </Link>
        }
      />

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Availability summary">
        <StatCard
          label="Saved slots"
          value={rows.length}
          detail="30 minutes each"
          icon={<Grid3X3 />}
          tone={rows.length > 0 ? 'green' : 'amber'}
        />
        <StatCard
          label="Hours per week"
          value={rows.length / 2}
          detail="Recurring availability"
          icon={<Clock3 />}
          tone="blue"
        />
        <StatCard
          label="Available days"
          value={availableDays}
          detail="Monday through Friday"
          icon={<CalendarDays />}
          tone="slate"
        />
      </section>

      <AvailabilityGrid
        checked={checked}
        action={saveAvailability}
        saved={saved === '1'}
        error={error === '1'}
      />
    </main>
  )
}
