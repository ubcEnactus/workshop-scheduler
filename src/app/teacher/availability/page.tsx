import Link from 'next/link'

import { AvailabilityGrid } from '@/components/availability-grid'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'

import { saveAvailability } from './actions'

type SearchParams = Promise<{ saved?: string; error?: string }>

export default async function TeacherAvailabilityPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const user = await requireRole('TEACHER')
  const { saved, error } = await searchParams

  const rows = await prisma.availability.findMany({
    where: { userId: user.id },
    select: { dayOfWeek: true, startMin: true },
  })
  const checked = new Set(rows.map((r) => `${r.dayOfWeek}-${r.startMin}`))

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link
        href="/teacher"
        className="text-xs font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        ← Back to dashboard
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Weekly availability</h1>
      <p className="mt-2 mb-8 text-sm text-zinc-600 dark:text-zinc-400">
        Check the 30-minute slots when you&apos;re free for workshops. Times are Pacific (Vancouver)
        school hours.
      </p>
      <AvailabilityGrid
        checked={checked}
        action={saveAvailability}
        saved={saved === '1'}
        error={error === '1'}
      />
    </main>
  )
}
