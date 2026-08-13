import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { FormError } from '@/components/form-error'
import { createCycle, openCycle, closeCycle, deleteCycle } from './actions'

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  OPEN: 'Open',
  SCHEDULED: 'Scheduled',
  CLOSED: 'Closed',
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'text-zinc-500',
  OPEN: 'text-green-600',
  SCHEDULED: 'text-blue-600',
  CLOSED: 'text-zinc-400',
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

export default async function CyclesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireRole('ADMIN')
  const { error } = await searchParams

  const cycles = await prisma.cycle.findMany({
    include: { _count: { select: { workshops: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Cycles</h1>

      <div className="mt-6">
        <FormError message={error} />
      </div>

      <form action={createCycle} className="mt-8 space-y-4">
        <h2 className="text-lg font-medium">New cycle</h2>
        <div>
          <label className="block text-sm font-medium">Name</label>
          <input
            name="name"
            required
            placeholder="e.g. Spring 2026"
            className="mt-1 block w-full rounded border px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">Start date</label>
            <input
              name="startDate"
              type="date"
              required
              className="mt-1 block w-full rounded border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">End date</label>
            <input
              name="endDate"
              type="date"
              required
              className="mt-1 block w-full rounded border px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          type="submit"
          className="rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700"
        >
          Create cycle
        </button>
      </form>

      <ul className="mt-12 divide-y">
        {cycles.length === 0 && <li className="py-4 text-sm text-zinc-500">No cycles yet.</li>}
        {cycles.map((cycle) => (
          <li key={cycle.id} className="flex items-start justify-between py-4">
            <div>
              <p className="font-medium">{cycle.name}</p>
              <p className="text-sm text-zinc-500">
                {formatDate(cycle.startDate)} – {formatDate(cycle.endDate)}
              </p>
              <p className={`mt-1 text-xs font-medium ${STATUS_COLORS[cycle.status]}`}>
                {STATUS_LABELS[cycle.status]}
                {cycle.status !== 'DRAFT' && ` · ${cycle._count.workshops} workshops`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {cycle.status === 'DRAFT' && (
                <>
                  <form action={openCycle}>
                    <input type="hidden" name="id" value={cycle.id} />
                    <button type="submit" className="text-sm text-green-600 hover:underline">
                      Open
                    </button>
                  </form>
                  <form action={deleteCycle}>
                    <input type="hidden" name="id" value={cycle.id} />
                    <button type="submit" className="text-sm text-red-600 hover:underline">
                      Delete
                    </button>
                  </form>
                </>
              )}
              {(cycle.status === 'OPEN' || cycle.status === 'SCHEDULED') && (
                <form action={closeCycle}>
                  <input type="hidden" name="id" value={cycle.id} />
                  <button type="submit" className="text-sm text-zinc-600 hover:underline">
                    Close
                  </button>
                </form>
              )}
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}
