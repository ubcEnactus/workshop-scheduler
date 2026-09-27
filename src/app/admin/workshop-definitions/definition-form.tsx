import { saveWorkshopDefinition } from '../class-workshops/actions'
import { dateOnly } from '@/lib/scheduling/delivery-windows'
import { SubmitButton } from '@/components/submit-button'
import { CreateWorkshopForm } from './create-workshop-form'

export function DefinitionForm({
  definition,
  returnToOverview = false,
}: {
  returnToOverview?: boolean
  definition?: {
    id: string
    number: number | null
    title: string
    description: string | null
    durationMinutes: number | null
    defaultMinPAs: number
    defaultMaxPAs: number
    deliveryStartsOn: Date | null
    deliveryEndsOn: Date | null
    updatedAt: Date
  }
}) {
  const fields = (
    <>
      {definition && <input type="hidden" name="id" value={definition.id} />}
      {definition && (
        <input type="hidden" name="expectedUpdatedAt" value={definition.updatedAt.toISOString()} />
      )}
      <div className="form-grid">
        <label className="field">
          Workshop title
          <input
            className="input"
            name="title"
            required
            maxLength={200}
            defaultValue={definition?.title}
          />
        </label>
        <label className="field">
          Reference number <span className="text-slate-500">(optional)</span>
          <input
            className="input"
            name="number"
            type="number"
            min="1"
            max="10000"
            defaultValue={definition?.number ?? undefined}
          />
        </label>
        <label className="field">
          Session duration (minutes)
          <input
            className="input"
            name="durationMinutes"
            type="number"
            min="1"
            max="1440"
            required
            defaultValue={definition?.durationMinutes ?? 60}
          />
        </label>
        <label className="field">
          Minimum PAs
          <input
            className="input"
            name="defaultMinPAs"
            type="number"
            min="1"
            max="100"
            required
            defaultValue={definition?.defaultMinPAs ?? 1}
          />
        </label>
        <label className="field">
          Maximum PAs
          <input
            className="input"
            name="defaultMaxPAs"
            type="number"
            min="1"
            max="100"
            required
            defaultValue={definition?.defaultMaxPAs ?? 3}
          />
        </label>
      </div>
      <fieldset className="space-y-3 rounded-xl bg-amber-50 p-4">
        <legend className="text-sm font-semibold">Shared delivery window</legend>
        <p className="text-sm text-slate-600">
          These inclusive Vancouver dates apply to every included school and teacher.
        </p>
        <div className="form-grid">
          <label className="field">
            Delivery starts
            <input
              className="input"
              name="deliveryStart"
              type="date"
              required={!definition}
              defaultValue={dateOnly(definition?.deliveryStartsOn ?? null)}
            />
          </label>
          <label className="field">
            Delivery ends
            <input
              className="input"
              name="deliveryEnd"
              type="date"
              required={!definition}
              defaultValue={dateOnly(definition?.deliveryEndsOn ?? null)}
            />
          </label>
        </div>
      </fieldset>
      {definition && (
        <details className="rounded-xl border border-slate-200 p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Review a window change that excludes existing sessions
          </summary>
          <div className="mt-3 space-y-3">
            <p className="text-sm text-slate-600">
              Existing approved date exceptions stay approved. If this edit newly excludes a teacher
              session, the first save will report the impact. Review the workshop, then use this
              confirmation to preserve those dates as recorded exceptions.
            </p>
            <label className="flex items-start gap-2 text-sm font-medium">
              <input className="mt-1 size-4" type="checkbox" name="confirmWindowImpact" value="1" />
              I reviewed the existing sessions and approve preserving newly out-of-window dates.
            </label>
            <label className="field">
              Exception reason
              <textarea className="input" name="windowExceptionReason" maxLength={1000} />
            </label>
          </div>
        </details>
      )}
      <label className="field">
        Description
        <textarea
          className="input"
          name="description"
          maxLength={2000}
          defaultValue={definition?.description ?? ''}
        />
      </label>
    </>
  )
  return definition ? (
    <form action={saveWorkshopDefinition} className="max-w-3xl space-y-4">
      {returnToOverview && <input type="hidden" name="returnToOverview" value="1" />}
      {fields}
      <SubmitButton>Save workshop details</SubmitButton>
    </form>
  ) : (
    <CreateWorkshopForm>{fields}</CreateWorkshopForm>
  )
}
