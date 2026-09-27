import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { FormError } from '@/components/form-error'
import { SubmitButton } from '@/components/submit-button'
import { buttonClasses } from '@/components/ui/button'
import { duplicateWorkshopDefinition } from '../class-workshops/actions'
import { deliveryWindowLabel } from '@/lib/scheduling/delivery-windows'
import { workshopIdentityKey, workshopRecordReference } from './workshop-reference'
import { DefinitionForm } from './definition-form'

export default async function WorkshopDefinitions({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requireRole('ADMIN')
  const query = await searchParams
  const showCreate = query.create === '1'
  const definitions = await prisma.workshopDefinition.findMany({
    orderBy: [{ deliveryStartsOn: 'desc' }, { createdAt: 'desc' }],
    include: {
      _count: { select: { classWorkshops: true } },
      classWorkshops: { select: { status: true } },
    },
  })
  const identityCounts = new Map<string, number>()
  for (const definition of definitions) {
    const key = workshopIdentityKey(definition)
    identityCounts.set(key, (identityCounts.get(key) ?? 0) + 1)
  }
  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Planning"
        title="Workshops"
        description="Each workshop has one shared, inclusive delivery window. Add its teachers, choose one date per teacher, then staff and publish the teacher sessions."
        actions={
          !showCreate && (
            <Link
              href="/admin/workshop-definitions?create=1#create-workshop"
              className={buttonClasses()}
            >
              Create a workshop
            </Link>
          )
        }
      />
      <FormError message={query.error} />
      {query.deleted === '1' && (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          Workshop deleted.
        </p>
      )}
      {query.saved && (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          Workshop details saved.
        </p>
      )}
      {showCreate && (
        <div id="create-workshop" className="scroll-mt-6">
          <Panel
            title="Create a workshop"
            description="Give this delivery a title and one shared date window. You will add teachers on the next screen."
            actions={
              <Link
                href="/admin/workshop-definitions"
                className={buttonClasses({ variant: 'secondary', size: 'sm' })}
              >
                Cancel
              </Link>
            }
          >
            <DefinitionForm />
          </Panel>
        </div>
      )}
      <div className="flex justify-end">
        <Link
          href="/admin/workshop-definitions/enroll"
          className={buttonClasses({ variant: 'secondary', size: 'sm' })}
        >
          Add teachers to multiple workshops
        </Link>
      </div>
      <section className="grid gap-4 xl:grid-cols-2" aria-label="Workshops">
        {definitions.map((definition) => {
          const completed = definition.classWorkshops.filter(
            (enrollment) => enrollment.status === 'COMPLETED'
          ).length
          const waived = definition.classWorkshops.filter(
            (enrollment) => enrollment.status === 'WAIVED'
          ).length
          const duplicateIdentity = identityCounts.get(workshopIdentityKey(definition))! > 1
          const showMetadata =
            definition.number !== null ||
            duplicateIdentity ||
            definition.identityStatus === 'NEEDS_IDENTIFICATION'
          return (
            <Panel
              key={definition.id}
              title={definition.title}
              description={`${deliveryWindowLabel(definition)} · ${definition._count.classWorkshops} included · ${completed} completed${waived ? ` · ${waived} not required` : ''}`}
              actions={
                <Link
                  href={'/admin/workshop-definitions/' + definition.id}
                  className={buttonClasses({ size: 'sm' })}
                >
                  Open workshop
                </Link>
              }
            >
              {showMetadata && (
                <p className="text-sm text-slate-600">
                  {definition.number === null ? '' : `Reference number ${definition.number}`}
                  {duplicateIdentity
                    ? `${definition.number === null ? '' : ' · '}Record ${workshopRecordReference(definition.id)}`
                    : ''}
                  {definition.identityStatus === 'NEEDS_IDENTIFICATION'
                    ? `${definition.number === null && !duplicateIdentity ? '' : ' · '}Imported identity needs review`
                    : ''}
                </p>
              )}
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold">
                  Edit workshop details
                </summary>
                <div className="mt-4">
                  <DefinitionForm definition={definition} />
                </div>
              </details>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold">
                  Duplicate as an independent workshop
                </summary>
                <form action={duplicateWorkshopDefinition} className="mt-4 space-y-4">
                  <input type="hidden" name="sourceId" value={definition.id} />
                  <p className="text-sm text-slate-600">
                    Descriptive defaults are copied. Teachers, sessions, assignments, publication,
                    and completion are not copied.
                  </p>
                  <div className="form-grid">
                    <label className="field">
                      New workshop title
                      <input className="input" name="title" required maxLength={200} />
                    </label>
                    <label className="field">
                      Reference number <span className="text-slate-500">(optional)</span>
                      <input className="input" name="number" type="number" min="1" max="10000" />
                    </label>
                    <label className="field">
                      Delivery starts
                      <input className="input" name="deliveryStart" type="date" required />
                    </label>
                    <label className="field">
                      Delivery ends
                      <input className="input" name="deliveryEnd" type="date" required />
                    </label>
                  </div>
                  <SubmitButton variant="secondary">Create independent workshop</SubmitButton>
                </form>
              </details>
            </Panel>
          )
        })}
      </section>
    </main>
  )
}
