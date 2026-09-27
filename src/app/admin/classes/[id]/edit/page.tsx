import Link from 'next/link'
import { parseSchedulingContext, schedulingHref } from '@/lib/scheduling/navigation'
import { parsePlanningReturn, planningReturnHref } from '@/lib/scheduling/planning-return'
import { notFound } from 'next/navigation'

import { ClassDefaults } from '@/components/class-defaults'
import { FormError } from '@/components/form-error'
import { SubmitButton } from '@/components/submit-button'
import { buttonClasses } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { updateClassSection } from '../../actions'

export default async function EditClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireRole('ADMIN')
  const { id } = await params
  const query = await searchParams
  const error = typeof query.error === 'string' ? query.error : undefined
  const context = { ...parseSchedulingContext(query), classSectionId: id }
  const planningReturn = parsePlanningReturn(query)
  const cls = await prisma.classSection.findUnique({
    where: { id },
    include: {
      school: true,
    },
  })
  if (!cls) notFound()

  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Teachers"
        title="Teacher details"
        description={`Manage details and future planning defaults for ${cls.name} at ${cls.school.name}.`}
        actions={
          <>
            {context.workshopDefinitionId && (
              <Link
                href={schedulingHref('/admin/workshops/plan', context)}
                className={buttonClasses()}
              >
                Back to workshop planning
              </Link>
            )}
            <Link
              href={schedulingHref('/admin/classes', context)}
              className={buttonClasses({ variant: 'secondary' })}
            >
              Back to teachers
            </Link>
          </>
        }
      />
      <nav
        aria-label="Teacher sections"
        className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2"
      >
        <Link
          href={schedulingHref(`/admin/classes/${id}`, context) + '#availability'}
          className={buttonClasses({ variant: 'ghost', size: 'sm' })}
        >
          Availability
        </Link>
        <Link
          href={schedulingHref(`/admin/classes/${id}`, context) + '#workshops'}
          className={buttonClasses({ variant: 'ghost', size: 'sm' })}
        >
          Workshops
        </Link>
        <Link
          href={schedulingHref(`/admin/classes/${id}/edit`, context)}
          aria-current="page"
          className={buttonClasses({ size: 'sm' })}
        >
          Details
        </Link>
      </nav>
      <FormError message={error} />
      {planningReturn && (
        <Link className="text-sm underline" href={planningReturnHref(context, query)}>
          Return to workshop planning
        </Link>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
        <Panel
          title="Teacher details"
          description="Changes to defaults apply to future planning only."
        >
          <form action={updateClassSection} className="space-y-5">
            {Object.entries(context).map(([key, value]) => (
              <input
                key={key}
                type="hidden"
                name={key === 'classSectionId' ? 'returnClassSectionId' : key}
                value={value}
              />
            ))}
            {planningReturn && (
              <>
                <input type="hidden" name="planning" value="1" />
                <input type="hidden" name="planningDraft" value={planningReturn.planningDraft} />
                {planningReturn.planningClassIds.map((classId) => (
                  <input key={classId} type="hidden" name="planningClassId" value={classId} />
                ))}
              </>
            )}
            <input type="hidden" name="id" value={cls.id} />
            <input type="hidden" name="name" value={cls.name} />
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
            <input type="hidden" name="teacherId" value={cls.teacherId} />
            <details
              open={!!planningReturn || !!error}
              className="rounded-xl border border-slate-200 p-4"
            >
              <summary className="cursor-pointer text-sm font-semibold">Session defaults</summary>
              <div className="mt-4">
                <ClassDefaults initial={cls} />
              </div>
            </details>
            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton>Save</SubmitButton>
              <Link
                href={schedulingHref(`/admin/classes/${id}`, context)}
                className={buttonClasses({ variant: 'ghost' })}
              >
                Cancel
              </Link>
            </div>
          </form>
        </Panel>

        <Panel
          title="Availability"
          description="Weekly times, start and end dates, extra availability, and closures are managed together on the teacher calendar."
        >
          <p className="text-sm text-slate-600">
            The calendar is the canonical availability editor. Saving availability does not create a
            teacher session.
          </p>
          <Link
            href={schedulingHref(`/admin/classes/${id}`, context) + '#availability'}
            className={`${buttonClasses({ variant: 'secondary' })} mt-4`}
          >
            Open availability
          </Link>
        </Panel>
      </div>
    </main>
  )
}
