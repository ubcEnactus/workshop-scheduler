import { randomUUID } from 'node:crypto'
import Link from 'next/link'
import { WorkshopBookingForm } from '@/components/workshop-booking-form'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { normalizeSchedulingContext, schedulingHref } from '@/lib/scheduling/navigation'
import { createWorkshopBooking } from '../booking-actions'

export default async function NewWorkshopPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requireRole('ADMIN')
  const query = await searchParams
  const [schools, teachers, allClasses] = await Promise.all([
    prisma.school.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, district: true },
    }),
    prisma.user.findMany({
      where: { role: 'TEACHER', deletedAt: null, school: { deletedAt: null } },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
      select: { id: true, name: true, email: true, schoolId: true },
    }),
    prisma.classSection.findMany({
      where: { school: { deletedAt: null }, teacher: { role: 'TEACHER', deletedAt: null } },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        schoolId: true,
        teacherId: true,
        defaultDurationMinutes: true,
        defaultMinPAs: true,
        defaultMaxPAs: true,
        teacher: { select: { schoolId: true } },
      },
    }),
  ])
  const classes = allClasses.filter((item) => item.teacher.schoolId === item.schoolId)
  const activeTeachers = teachers.filter(
    (teacher): teacher is typeof teacher & { schoolId: string } => teacher.schoolId !== null
  )
  const { context } = normalizeSchedulingContext(query, classes, schools)

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Schedule workspace"
        title="Book a workshop"
        description="Confirm one workshop now. You can use saved details or add the school, teacher and class as you book."
      >
        <Link className="text-sm underline" href={schedulingHref('/admin/workshops', context)}>
          ← Back to workshops
        </Link>
      </PageHeader>
      <Panel>
        <WorkshopBookingForm
          action={createWorkshopBooking}
          requestKey={randomUUID()}
          schools={schools}
          teachers={activeTeachers}
          classes={classes.map((item) => ({
            id: item.id,
            name: item.name,
            schoolId: item.schoolId,
            teacherId: item.teacherId,
            defaultDurationMinutes: item.defaultDurationMinutes,
            defaultMinPAs: item.defaultMinPAs,
            defaultMaxPAs: item.defaultMaxPAs,
          }))}
          context={context}
        />
      </Panel>
    </main>
  )
}
