import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { FormError } from '@/components/form-error'
import { WorkshopForm } from '@/components/workshop-form'
import {
  formatInstantRange,
  vancouverDateKey,
  vancouverMinuteOfDay,
  vancouverMonthKey,
} from '@/lib/time'
import { updateWorkshop } from '../actions'
import { loadSchedule } from '@/lib/scheduling/store'
import { WorkshopStaffing } from '@/components/workshop-staffing'

function clock(date: Date) {
  const minute = vancouverMinuteOfDay(date)
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

export default async function WorkshopDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; saved?: string }>
}) {
  await requireRole('ADMIN')
  const { id } = await params
  const { error, saved } = await searchParams
  const workshop = await prisma.workshop.findFirst({
    where: { id, classSection: { school: { deletedAt: null }, teacher: { deletedAt: null } } },
    include: {
      classSection: { include: { school: true } },
      _count: { select: { assignments: true } },
    },
  })
  if (!workshop) notFound()
  const classes = await prisma.classSection.findMany({
    where: { school: { deletedAt: null }, teacher: { role: 'TEACHER', deletedAt: null } },
    include: {
      school: true,
      teacher: true,
      meetings: { orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] },
    },
    orderBy: { name: 'asc' },
  })
  const month = vancouverMonthKey(workshop.scheduledStart)
  const snapshot = await loadSchedule(prisma)
  const staffingWorkshop = snapshot.workshops.find((w) => w.id === id)
  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-6 py-12">
      <Link href={`/admin/workshops?month=${month}`} className="text-sm underline">
        Back to {month}
      </Link>
      <header>
        <h1 className="text-3xl font-semibold">Workshop details</h1>
        <p className="mt-2">
          {workshop.classSection.name} · {workshop.classSection.school.name}
        </p>
        <p className="mt-2 text-sm">
          {formatInstantRange(workshop.scheduledStart, workshop.scheduledEnd)} · America/Vancouver
        </p>
        <p className="mt-2 text-sm">
          Status: {workshop.status.toLowerCase()} · {workshop._count.assignments} PAs assigned
        </p>
      </header>
      <FormError message={error} />
      {saved === '1' && (
        <p role="status" className="rounded border p-3">
          Draft saved.
        </p>
      )}
      {workshop.status === 'DRAFT' && workshop._count.assignments === 0 ? (
        <WorkshopForm
          action={updateWorkshop}
          classes={classes}
          month={month}
          initial={{
            id,
            version: workshop.version,
            classSectionId: workshop.classSectionId,
            date: vancouverDateKey(workshop.scheduledStart),
            startTime: clock(workshop.scheduledStart),
            endTime: clock(workshop.scheduledEnd),
            minPAs: workshop.minPAs,
            maxPAs: workshop.maxPAs,
          }}
        />
      ) : (
        <p>Only unstaffed draft workshops can be edited here.</p>
      )}
      {staffingWorkshop && <WorkshopStaffing workshop={staffingWorkshop} snapshot={snapshot} />}
    </main>
  )
}
