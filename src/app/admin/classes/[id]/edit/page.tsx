import Link from 'next/link'
import { Clock3 } from 'lucide-react'
import { notFound } from 'next/navigation'

import { ClassDefaults } from '@/components/class-defaults'
import { FormError } from '@/components/form-error'
import { SubmitButton } from '@/components/submit-button'
import { buttonClasses } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { DAY_LABELS } from '@/lib/time'

import { addMeeting, deleteMeeting, updateClassSection } from '../../actions'

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0')
  const minutesPastHour = (minutes % 60).toString().padStart(2, '0')
  return `${hours}:${minutesPastHour}`
}

export default async function EditClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  await requireRole('ADMIN')
  const { id } = await params
  const { error } = await searchParams
  const cls = await prisma.classSection.findUnique({
    where: { id },
    include: {
      meetings: { orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] },
      school: true,
    },
  })
  if (!cls) notFound()

  const teachers = await prisma.user.findMany({
    where: {
      role: 'TEACHER',
      OR: [{ deletedAt: null, school: { deletedAt: null } }, { id: cls.teacherId }],
    },
    include: { school: true },
    orderBy: { name: 'asc' },
  })

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Classes"
        title="Edit class"
        description={`Manage details, planning defaults, and weekly meeting times for ${cls.name} at ${cls.school.name}.`}
        actions={
          <Link href="/admin/classes" className={buttonClasses({ variant: 'secondary' })}>
            Back to classes
          </Link>
        }
      />
      <FormError message={error} />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
        <Panel
          title="Class details"
          description="Changes to defaults apply to future planning only."
        >
          <form action={updateClassSection} className="space-y-5">
            <input type="hidden" name="id" value={cls.id} />
            <div className="field">
              <label htmlFor="class-name">Class name</label>
              <input
                id="class-name"
                name="name"
                defaultValue={cls.name}
                required
                className="input"
              />
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="class-subject">Subject (optional)</label>
                <input
                  id="class-subject"
                  name="subject"
                  defaultValue={cls.subject ?? ''}
                  className="input"
                />
              </div>
              <div className="field">
                <label htmlFor="class-grade">Grade (optional)</label>
                <input
                  id="class-grade"
                  name="grade"
                  defaultValue={cls.grade ?? ''}
                  className="input"
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="class-teacher">Teacher</label>
              <select
                id="class-teacher"
                name="teacherId"
                defaultValue={cls.teacherId}
                required
                className="input"
              >
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.deletedAt
                      ? `${teacher.name} (removed)`
                      : `${teacher.name} · ${teacher.school?.name ?? 'No school'}`}
                  </option>
                ))}
              </select>
            </div>
            <ClassDefaults initial={cls} />
            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton>Save</SubmitButton>
              <Link href="/admin/classes" className={buttonClasses({ variant: 'ghost' })}>
                Cancel
              </Link>
            </div>
          </form>
        </Panel>

        <div className="space-y-6">
          <Panel
            title="Meeting times"
            description="Weekly Vancouver times that admins use when planning workshops."
          >
            {cls.meetings.length === 0 ? (
              <div className="empty-state">
                <Clock3 className="size-6" aria-hidden="true" />
                <p>No meeting times yet.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {cls.meetings.map((meeting) => (
                  <li
                    key={meeting.id}
                    className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      {`${DAY_LABELS[meeting.dayOfWeek]} · ${minutesToTime(meeting.startMinute)}–${minutesToTime(meeting.endMinute)}`}
                    </p>
                    <form action={deleteMeeting}>
                      <input type="hidden" name="id" value={meeting.id} />
                      <SubmitButton
                        variant="danger"
                        size="sm"
                        aria-label={`Remove ${DAY_LABELS[meeting.dayOfWeek]} ${minutesToTime(meeting.startMinute)}–${minutesToTime(meeting.endMinute)}`}
                      >
                        Remove
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Add meeting time"
            description="Add each recurring weekday block when this class can host a workshop."
          >
            <form action={addMeeting} className="space-y-5">
              <input type="hidden" name="classSectionId" value={cls.id} />
              <div className="field">
                <label htmlFor="meeting-day">Day</label>
                <select id="meeting-day" name="dayOfWeek" required className="input">
                  {DAY_LABELS.map((label, index) => (
                    <option key={label} value={index}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="meeting-start">Start time</label>
                  <input
                    id="meeting-start"
                    name="startTime"
                    type="time"
                    required
                    className="input"
                  />
                </div>
                <div className="field">
                  <label htmlFor="meeting-end">End time</label>
                  <input id="meeting-end" name="endTime" type="time" required className="input" />
                </div>
              </div>
              <SubmitButton>Add time</SubmitButton>
            </form>
          </Panel>
        </div>
      </div>
    </main>
  )
}
