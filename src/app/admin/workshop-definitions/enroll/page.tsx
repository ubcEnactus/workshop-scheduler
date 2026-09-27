import { randomUUID } from 'node:crypto'
import Link from 'next/link'
import { FormError } from '@/components/form-error'
import { buttonClasses } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { deliveryWindowLabel } from '@/lib/scheduling/delivery-windows'
import { ClassPicker } from '../../class-workshops/class-picker'
import { EnrollmentForm } from '../../class-workshops/enrollment-form'
import { generateCandidatesFromClassContext } from '@/lib/scheduling/recurring-candidates'
import { workshopIdentityKey, workshopRecordReference } from '../workshop-reference'

function values(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value
  return value ? [value] : []
}

export default async function BulkEnrollmentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireRole('ADMIN')
  const query = await searchParams
  const selectedRunIds = [...new Set(values(query.runIds))]
  const selectedClassIds = [...new Set(values(query.classSectionIds))]
  const [runs, schools, existing, activeTeachers] = await Promise.all([
    prisma.workshopDefinition.findMany({
      orderBy: [{ deliveryStartsOn: 'desc' }, { title: 'asc' }],
    }),
    prisma.school.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: {
        closures: true,
        classSections: {
          where: { archivedAt: null },
          orderBy: { name: 'asc' },
          include: {
            teacher: true,
            availabilitySlots: { select: { id: true, start: true, end: true } },
            meetings: { include: { skips: true } },
            availabilityExceptions: true,
          },
        },
      },
    }),
    selectedRunIds.length && selectedClassIds.length
      ? prisma.classWorkshop.findMany({
          where: {
            workshopDefinitionId: { in: selectedRunIds },
            classSectionId: { in: selectedClassIds },
          },
          select: { workshopDefinitionId: true, classSectionId: true, status: true },
        })
      : Promise.resolve([]),
    prisma.user.findMany({
      where: { role: 'TEACHER', deletedAt: null },
      select: { id: true, name: true, email: true, schoolId: true },
    }),
  ])
  const identityCounts = new Map<string, number>()
  for (const run of runs) {
    const key = workshopIdentityKey(run)
    identityCounts.set(key, (identityCounts.get(key) ?? 0) + 1)
  }
  const activeClasses = schools.flatMap((school) =>
    school.classSections
      .map((cls) => ({
        ...cls,
        school,
        effectiveTeacher: activeTeachers.find((teacher) => teacher.id === cls.teacherId),
      }))
      .filter(
        (cls): cls is typeof cls & { effectiveTeacher: (typeof activeTeachers)[number] } =>
          cls.effectiveTeacher?.schoolId === school.id
      )
  )
  const selectedRuns = runs.filter((run) => selectedRunIds.includes(run.id))
  const selectedClasses = activeClasses.filter((cls) => selectedClassIds.includes(cls.id))
  const existingByKey = new Map(
    existing.map((pair) => [pair.workshopDefinitionId + ':' + pair.classSectionId, pair.status])
  )
  const pairs = selectedRuns.flatMap((run) =>
    selectedClasses.map((cls) => ({
      run,
      cls,
      existingStatus: existingByKey.get(run.id + ':' + cls.id),
      warning:
        !run.deliveryStartsOn || !run.deliveryEndsOn
          ? 'Workshop window needs setup'
          : !generateCandidatesFromClassContext({
                windowStart: run.deliveryStartsOn,
                windowEnd: run.deliveryEndsOn,
                durationMinutes: run.durationMinutes ?? cls.defaultDurationMinutes,
                meetings: cls.meetings,
                exceptions: cls.availabilityExceptions,
                schoolClosures: cls.school.closures,
                explicit: cls.availabilitySlots.map((slot) => ({
                  id: slot.id,
                  start: slot.start,
                  end: slot.end,
                })),
                maxCandidates: 1,
              }).length
            ? 'No scheduling availability recorded'
            : null,
    }))
  )
  const newCount = pairs.filter((pair) => !pair.existingStatus).length
  const waivedCount = pairs.filter((pair) => pair.existingStatus === 'WAIVED').length

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Workshops"
        title="Add teachers to workshops"
        description="Choose one or more workshops and the teachers that should receive them. Review the additions before saving."
        actions={
          <Link
            href="/admin/workshop-definitions"
            className={buttonClasses({ variant: 'secondary' })}
          >
            Back to workshops
          </Link>
        }
      />
      <FormError message={typeof query.error === 'string' ? query.error : undefined} />
      {typeof query.saved === 'string' && (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          Teachers added. {query.saved} new teacher addition{query.saved === '1' ? '' : 's'} saved;
          teachers already included were unchanged.
        </p>
      )}
      <Panel
        title="1. Select workshops and teachers"
        description="A teacher is included only in the workshops you select here."
      >
        <form method="get" action="/admin/workshop-definitions/enroll" className="space-y-6">
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">Workshops</legend>
            <div className="grid gap-3 md:grid-cols-2">
              {runs.map((run) => (
                <label
                  key={run.id}
                  className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-4"
                >
                  <input
                    type="checkbox"
                    name="runIds"
                    value={run.id}
                    defaultChecked={selectedRunIds.includes(run.id)}
                    className="mt-1 size-4"
                  />
                  <span>
                    <span className="block font-semibold">{run.title}</span>
                    <span className="block text-xs text-slate-500">
                      {deliveryWindowLabel(run)}
                      {identityCounts.get(workshopIdentityKey(run))! > 1
                        ? ` · Record ${workshopRecordReference(run.id)}`
                        : ''}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <ClassPicker
            initialSelectedIds={selectedClassIds}
            schools={schools.map((school) => ({
              id: school.id,
              name: school.name,
              classes: school.classSections
                .map((cls) => ({
                  cls,
                  teacher: activeTeachers.find((teacher) => teacher.id === cls.teacherId),
                }))
                .filter(
                  (entry): entry is typeof entry & { teacher: (typeof activeTeachers)[number] } =>
                    entry.teacher?.schoolId === school.id
                )
                .map(({ cls, teacher }) => ({
                  id: cls.id,
                  name: cls.name,
                  teacherName: teacher.name ?? teacher.email,
                })),
            }))}
          />
          <button type="submit" className={buttonClasses()}>
            Review selected teachers
          </button>
        </form>
      </Panel>

      {pairs.length > 0 && (
        <Panel
          title="2. Review teachers by workshop"
          description={`${selectedRuns.length} workshop${selectedRuns.length === 1 ? '' : 's'} · ${selectedClasses.length} selected teacher${selectedClasses.length === 1 ? '' : 's'} · ${newCount} additions · ${pairs.length - newCount - waivedCount} already included · ${waivedCount} previously not required`}
        >
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Workshop</th>
                  <th>Window</th>
                  <th>School</th>
                  <th>Teacher</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {pairs.map((pair) => (
                  <tr key={pair.run.id + ':' + pair.cls.id}>
                    <td className="font-semibold">
                      {pair.run.title}
                      {identityCounts.get(workshopIdentityKey(pair.run))! > 1 && (
                        <span className="mt-1 block text-xs font-normal text-slate-500">
                          Record {workshopRecordReference(pair.run.id)}
                        </span>
                      )}
                    </td>
                    <td>{deliveryWindowLabel(pair.run)}</td>
                    <td>{pair.cls.school.name}</td>
                    <td>
                      {pair.cls.name}
                      <p className="text-xs text-slate-500">
                        {pair.cls.effectiveTeacher.name ?? pair.cls.effectiveTeacher.email}
                      </p>
                    </td>
                    <td>
                      <span
                        className={
                          pair.existingStatus === 'WAIVED'
                            ? 'font-semibold text-amber-800'
                            : pair.existingStatus
                              ? 'text-slate-500'
                              : 'font-semibold text-emerald-800'
                        }
                      >
                        {pair.existingStatus === 'WAIVED'
                          ? 'Previously not required · restore from the workshop'
                          : pair.existingStatus
                            ? 'Already included · unchanged'
                            : 'Will be added'}
                      </span>
                      {pair.warning && (
                        <p className="mt-1 text-xs font-semibold text-amber-800">
                          ⚠ {pair.warning}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5">
            <EnrollmentForm
              submitLabel={`Add ${newCount} teacher${newCount === 1 ? '' : 's'} to selected workshops`}
            >
              {selectedRuns.map((run) => (
                <input key={run.id} type="hidden" name="runIds" value={run.id} />
              ))}
              {selectedClasses.map((cls) => (
                <input key={cls.id} type="hidden" name="classSectionIds" value={cls.id} />
              ))}
              <input type="hidden" name="requestKey" value={randomUUID()} />
              <p className="text-sm text-slate-600">
                This adds teachers to the selected workshops. It does not create or move
                teacher-session dates.
              </p>
            </EnrollmentForm>
          </div>
        </Panel>
      )}
    </main>
  )
}
