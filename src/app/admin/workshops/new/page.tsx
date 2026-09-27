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
  const [schools, teachers, allClasses, definitions] = await Promise.all([
    prisma.school.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { role: 'TEACHER', deletedAt: null, school: { deletedAt: null } },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
      select: { id: true, name: true, email: true, schoolId: true },
    }),
    prisma.classSection.findMany({
      where: {
        archivedAt: null,
        school: { deletedAt: null },
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        schoolId: true,
        teacherId: true,
        defaultDurationMinutes: true,
        defaultMinPAs: true,
        defaultMaxPAs: true,
        meetings: {
          orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
          select: { dayOfWeek: true, startMinute: true, endMinute: true },
        },
      },
    }),
    prisma.workshopDefinition.findMany({
      where: { identityStatus: 'IDENTIFIED' },
      orderBy: [{ deliveryStartsOn: 'asc' }, { title: 'asc' }],
      select: {
        id: true,
        number: true,
        title: true,
        durationMinutes: true,
        deliveryStartsOn: true,
        deliveryEndsOn: true,
        defaultMinPAs: true,
        defaultMaxPAs: true,
      },
    }),
  ])
  const classes = allClasses
  const activeTeachers = teachers.filter(
    (teacher): teacher is typeof teacher & { schoolId: string } => teacher.schoolId !== null
  )
  const { context } = normalizeSchedulingContext(query, classes, schools)
  const initialTeacher = activeTeachers.find(
    (teacher) =>
      teacher.id === query.teacherId && (!context.schoolId || teacher.schoolId === context.schoolId)
  )

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Schedule workspace"
        title="Schedule a confirmed teacher session"
        description="Choose a date and a host. Save a draft, then assign PAs and publish when you’re ready."
      >
        <Link className="text-sm underline" href={schedulingHref('/admin/workshops', context)}>
          ← Back to {context.workshopDefinitionId ? 'workshop schedule' : 'calendar'}
        </Link>
      </PageHeader>
      <Panel>
        <WorkshopBookingForm
          action={createWorkshopBooking}
          definitions={definitions}
          requestKey={randomUUID()}
          schools={schools}
          teachers={activeTeachers}
          initialTeacherId={initialTeacher?.id}
          classes={classes.map((item) => ({
            id: item.id,
            name: item.name,
            schoolId: item.schoolId,
            teacherId: item.teacherId,
            defaultDurationMinutes: item.defaultDurationMinutes,
            defaultMinPAs: item.defaultMinPAs,
            defaultMaxPAs: item.defaultMaxPAs,
            meetings: item.meetings,
          }))}
          context={context}
        />
      </Panel>
    </main>
  )
}
