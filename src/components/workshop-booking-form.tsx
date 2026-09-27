'use client'

import Link from 'next/link'
import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { ReadyFields } from '@/components/ready-fields'
import { SubmitButton } from '@/components/submit-button'
import type { WorkshopFormState } from '@/lib/schemas/form-state'
import { schedulingHref, type SchedulingContext } from '@/lib/scheduling/navigation'
import { DAY_LABELS, formatSlotRange } from '@/lib/time'
import { deliveryWindowLabel } from '@/lib/scheduling/delivery-windows'
import { workshopRecordReference } from '@/app/admin/workshop-definitions/workshop-reference'

const NEW_CHOICE = '__new__'

export type BookingSchool = { id: string; name: string }
export type BookingTeacher = { id: string; name: string | null; email: string; schoolId: string }
export type BookingClass = {
  id: string
  name: string
  schoolId: string
  teacherId: string
  defaultDurationMinutes: number
  defaultMinPAs: number
  defaultMaxPAs: number
  meetings: { dayOfWeek: number; startMinute: number; endMinute: number }[]
}

function endTimeFor(startTime: string, durationMinutes: number) {
  const match = /^(\d{2}):(\d{2})$/.exec(startTime)
  if (!match) return ''
  const end = Number(match[1]) * 60 + Number(match[2]) + durationMinutes
  if (end >= 24 * 60) return ''
  return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`
}

type Values = {
  workshopDefinitionId: string
  schoolChoice: string
  schoolName: string
  teacherChoice: string
  teacherName: string
  teacherEmail: string
  classChoice: string
  className: string
  date: string
  startTime: string
  endTime: string
  minPAs: string
  maxPAs: string
}

export function WorkshopBookingForm({
  action,
  requestKey,
  schools,
  teachers,
  classes,
  context,
  initialTeacherId,
  definitions,
}: {
  action: (state: WorkshopFormState, form: FormData) => Promise<WorkshopFormState>
  requestKey: string
  schools: BookingSchool[]
  teachers: BookingTeacher[]
  classes: BookingClass[]
  context: SchedulingContext
  initialTeacherId?: string
  definitions: {
    id: string
    title: string
    number: number | null
    deliveryStartsOn?: Date | null
    deliveryEndsOn?: Date | null
    durationMinutes?: number | null
    defaultMinPAs?: number
    defaultMaxPAs?: number
  }[]
}) {
  const initialTeacherClasses = classes.filter((item) => item.teacherId === initialTeacherId)
  const initialClass =
    classes.find((item) => item.id === context.classSectionId) ??
    (initialTeacherClasses.length === 1 ? initialTeacherClasses[0] : undefined)
  const initialClassTeacherId = initialClass ? initialClass.teacherId : initialTeacherId
  const initialTeacher = teachers.find((item) => item.id === initialClassTeacherId)
  const initialSchoolId =
    initialClass?.schoolId ??
    initialTeacher?.schoolId ??
    schools.find((s) => s.id === context.schoolId)?.id
  const [values, setValues] = useState<Values>({
    workshopDefinitionId:
      definitions.find((definition) => definition.id === context.workshopDefinitionId)?.id ?? '',
    schoolChoice: initialSchoolId ?? (schools.length ? '' : NEW_CHOICE),
    schoolName: '',
    teacherChoice:
      (initialClass ? initialClassTeacherId : initialTeacher?.id) ??
      (initialSchoolId && teachers.some((t) => t.schoolId === initialSchoolId) ? '' : NEW_CHOICE),
    teacherName: '',
    teacherEmail: '',
    classChoice: initialClass?.id ?? NEW_CHOICE,
    className: '',
    date: '',
    startTime: '',
    endTime: '',
    minPAs: String(
      definitions.find((definition) => definition.id === context.workshopDefinitionId)
        ?.defaultMinPAs ?? 1
    ),
    maxPAs: String(
      definitions.find((definition) => definition.id === context.workshopDefinitionId)
        ?.defaultMaxPAs ?? 3
    ),
  })
  const [endTimeManuallyEdited, setEndTimeManuallyEdited] = useState(false)
  const [state, formAction, pending] = useActionState(action, {})
  const formRef = useRef<HTMLFormElement>(null)
  const advancedRef = useRef<HTMLDetailsElement>(null)
  const availableTeachers = useMemo(
    () => teachers.filter((t) => t.schoolId === values.schoolChoice),
    [teachers, values.schoolChoice]
  )
  const selectedSchool = schools.find((s) => s.id === values.schoolChoice)
  const selectedTeacher = teachers.find((t) => t.id === values.teacherChoice)
  const selectedClass = classes.find((c) => c.id === values.classChoice)
  const selectedClassTeacherId = selectedClass ? selectedClass.teacherId : undefined
  const selectedClassTeacherUnavailable = Boolean(
    selectedClassTeacherId &&
    !teachers.some(
      (teacher) =>
        teacher.id === selectedClassTeacherId && teacher.schoolId === selectedClass?.schoolId
    )
  )
  const selectedDefinition = definitions.find((d) => d.id === values.workshopDefinitionId)
  const hostName = selectedTeacher?.name ?? selectedTeacher?.email ?? values.teacherName
  const schoolName = selectedSchool?.name ?? values.schoolName
  const duration =
    values.startTime && values.endTime
      ? Number(values.endTime.slice(0, 2)) * 60 +
        Number(values.endTime.slice(3)) -
        Number(values.startTime.slice(0, 2)) * 60 -
        Number(values.startTime.slice(3))
      : 0

  useEffect(() => {
    if (!state.error) return
    if (state.fields?.minPAs || state.fields?.maxPAs) advancedRef.current?.setAttribute('open', '')
    requestAnimationFrame(() => {
      const target = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ;(target ?? formRef.current?.querySelector<HTMLElement>('[role="alert"]'))?.focus()
    })
  }, [state])

  function update(key: keyof Values, value: string) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  function chooseClass(classId: string) {
    const item = classes.find((c) => c.id === classId)
    setValues((current) => ({
      ...current,
      classChoice: item?.id ?? NEW_CHOICE,
      className: '',
      ...(item
        ? {
            schoolChoice: item.schoolId,
            teacherChoice: item.teacherId,
            schoolName: '',
            teacherName: '',
            teacherEmail: '',
          }
        : {}),
      endTime: endTimeManuallyEdited
        ? current.endTime
        : endTimeFor(
            current.startTime,
            selectedDefinition?.durationMinutes ?? item?.defaultDurationMinutes ?? 60
          ),
      minPAs: String(selectedDefinition?.defaultMinPAs ?? 1),
      maxPAs: String(selectedDefinition?.defaultMaxPAs ?? 3),
    }))
  }

  function chooseTeacher(teacherId: string) {
    const teacherClasses = classes.filter(
      (item) => item.teacherId === teacherId && item.schoolId === values.schoolChoice
    )
    if (teacherClasses.length === 1) {
      chooseClass(teacherClasses[0].id)
      return
    }
    setValues((current) => ({
      ...current,
      teacherChoice: teacherId,
      teacherName: '',
      teacherEmail: '',
      classChoice: NEW_CHOICE,
      className: '',
      minPAs: String(selectedDefinition?.defaultMinPAs ?? 1),
      maxPAs: String(selectedDefinition?.defaultMaxPAs ?? 3),
      endTime: endTimeManuallyEdited
        ? current.endTime
        : endTimeFor(current.startTime, selectedDefinition?.durationMinutes ?? 60),
    }))
  }

  function fieldProps(name: keyof Values) {
    return {
      'aria-invalid': state.fields?.[name] ? (true as const) : undefined,
      'aria-describedby': state.fields?.[name] ? `booking-error-${name}` : undefined,
    }
  }
  function error(name: keyof Values) {
    return state.fields?.[name] ? (
      <span id={`booking-error-${name}`} className="text-xs text-red-800">
        {state.fields[name]}
      </span>
    ) : null
  }
  function textField(
    name: keyof Values,
    label: string,
    options: { required?: boolean; type?: string; placeholder?: string } = {}
  ) {
    return (
      <label className="field">
        <span>{label}</span>
        <input
          aria-label={label}
          name={name}
          className="input"
          value={values[name]}
          onChange={(event) => update(name, event.target.value)}
          {...options}
          {...fieldProps(name)}
        />
        {error(name)}
      </label>
    )
  }

  return (
    <form ref={formRef} action={formAction} noValidate>
      <ReadyFields disabled={pending}>
        <input type="hidden" name="requestKey" value={requestKey} />
        <input type="hidden" name="month" value={context.month} />
        <input type="hidden" name="schoolId" value={context.schoolId ?? ''} />
        <input type="hidden" name="returnClassSectionId" value={context.classSectionId ?? ''} />
        <input type="hidden" name="view" value={context.view ?? ''} />
        <input type="hidden" name="classChoice" value={values.classChoice} />
        {state.error && (
          <div
            role="alert"
            tabIndex={-1}
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            <p className="font-semibold">The workshop could not be booked.</p>
            <p>{state.error} Your entries have been kept.</p>
          </div>
        )}

        <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 space-y-8">
            <section aria-labelledby="booking-time-heading" className="space-y-4">
              <label className="field">
                <span>Workshop</span>
                <select
                  className="input"
                  name="workshopDefinitionId"
                  aria-label="Workshop"
                  value={values.workshopDefinitionId}
                  onChange={(e) => {
                    const run = definitions.find((d) => d.id === e.target.value)
                    setValues((current) => ({
                      ...current,
                      workshopDefinitionId: e.target.value,
                      minPAs: String(run?.defaultMinPAs ?? 1),
                      maxPAs: String(run?.defaultMaxPAs ?? 3),
                      endTime: endTimeManuallyEdited
                        ? current.endTime
                        : endTimeFor(
                            current.startTime,
                            run?.durationMinutes ?? selectedClass?.defaultDurationMinutes ?? 60
                          ),
                    }))
                  }}
                  required
                  {...fieldProps('workshopDefinitionId')}
                >
                  <option value="">Select a workshop…</option>
                  {definitions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title} ·{' '}
                      {deliveryWindowLabel({
                        deliveryStartsOn: d.deliveryStartsOn ?? null,
                        deliveryEndsOn: d.deliveryEndsOn ?? null,
                      })}{' '}
                      · Record {workshopRecordReference(d.id)}
                    </option>
                  ))}
                </select>
                {error('workshopDefinitionId')}
              </label>
              {!definitions.length && (
                <Link
                  href="/admin/workshop-definitions?create=1#create-workshop"
                  className="text-sm underline"
                >
                  Create a workshop before scheduling a teacher session
                </Link>
              )}
              <div>
                <h2 id="booking-time-heading" className="text-lg font-semibold text-slate-900">
                  1. Choose the workshop time
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  One teacher session on a confirmed date. All times are in Vancouver.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {(
                  [
                    ['date', 'Vancouver date', 'date'],
                    ['startTime', 'Start time', 'time'],
                    ['endTime', 'End time', 'time'],
                  ] as const
                ).map(([name, label, type]) => (
                  <label key={name} className="field">
                    <span>{label}</span>
                    <input
                      aria-label={label}
                      className="input"
                      name={name}
                      type={type}
                      step={type === 'time' ? 900 : undefined}
                      value={values[name]}
                      onChange={(event) => {
                        const value = event.target.value
                        if (name === 'startTime')
                          setValues((current) => ({
                            ...current,
                            startTime: value,
                            endTime: endTimeManuallyEdited
                              ? current.endTime
                              : endTimeFor(
                                  value,
                                  selectedDefinition?.durationMinutes ??
                                    selectedClass?.defaultDurationMinutes ??
                                    60
                                ),
                          }))
                        else if (name === 'date') {
                          setValues((current) => {
                            const currentClass = classes.find(
                              (item) => item.id === current.classChoice
                            )
                            return {
                              ...current,
                              date: value,
                              ...(currentClass
                                ? {
                                    teacherChoice: currentClass.teacherId,
                                    teacherName: '',
                                    teacherEmail: '',
                                  }
                                : {}),
                            }
                          })
                        } else {
                          if (name === 'endTime') setEndTimeManuallyEdited(true)
                          update(name, value)
                        }
                      }}
                      required
                      {...fieldProps(name)}
                    />
                    {error(name)}
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                {duration > 0 ? `${duration} minutes · ` : ''}End time starts with a{' '}
                {selectedDefinition?.durationMinutes ?? selectedClass?.defaultDurationMinutes ?? 60}
                -minute duration. You can change it.
              </p>
            </section>

            <section
              aria-labelledby="booking-host-heading"
              className="space-y-4 border-t border-slate-200 pt-6"
            >
              <div>
                <h2 id="booking-host-heading" className="text-lg font-semibold text-slate-900">
                  2. Choose the host
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Choose the school and teacher. Each teacher represents their class.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="min-w-0 space-y-3">
                  <label className="field">
                    <span>School</span>
                    <select
                      aria-label="Choose or add a school"
                      className="input"
                      name="schoolChoice"
                      value={values.schoolChoice}
                      onChange={(event) => {
                        const schoolChoice = event.target.value
                        setValues((current) => ({
                          ...current,
                          schoolChoice,
                          schoolName: '',
                          teacherChoice: teachers.some((t) => t.schoolId === schoolChoice)
                            ? ''
                            : NEW_CHOICE,
                          teacherName: '',
                          teacherEmail: '',
                          classChoice: NEW_CHOICE,
                          className: '',
                          minPAs: String(selectedDefinition?.defaultMinPAs ?? 1),
                          maxPAs: String(selectedDefinition?.defaultMaxPAs ?? 3),
                          endTime: endTimeManuallyEdited
                            ? current.endTime
                            : endTimeFor(
                                current.startTime,
                                selectedDefinition?.durationMinutes ?? 60
                              ),
                        }))
                      }}
                      {...fieldProps('schoolChoice')}
                    >
                      <option value="" disabled>
                        Select a school…
                      </option>
                      {schools.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                      <option value={NEW_CHOICE}>+ Add a new school</option>
                    </select>
                    {error('schoolChoice')}
                  </label>
                  {values.schoolChoice === NEW_CHOICE && (
                    <div className="space-y-3 rounded-xl bg-slate-50 p-4">
                      {textField('schoolName', 'School name', { required: true })}
                    </div>
                  )}
                </div>
                <div className="min-w-0 space-y-3">
                  <label className="field">
                    <span>Teacher</span>
                    <select
                      aria-label="Choose or add a teacher"
                      className="input"
                      name="teacherChoice"
                      value={values.schoolChoice ? values.teacherChoice : ''}
                      disabled={!values.schoolChoice}
                      onChange={(event) => chooseTeacher(event.target.value)}
                      {...fieldProps('teacherChoice')}
                    >
                      <option value="" disabled>
                        {values.schoolChoice ? 'Select a teacher…' : 'Choose a school first'}
                      </option>
                      {selectedClassTeacherUnavailable && selectedClassTeacherId && (
                        <option value={selectedClassTeacherId}>
                          Teacher unavailable on this date
                        </option>
                      )}
                      {availableTeachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name ?? t.email}
                        </option>
                      ))}
                      <option value={NEW_CHOICE}>+ Add a new teacher</option>
                    </select>
                    {error('teacherChoice')}
                  </label>
                  {selectedClassTeacherUnavailable && (
                    <p
                      role="alert"
                      className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                    >
                      This teacher is unavailable at the selected school on this date. Choose
                      another teacher.
                    </p>
                  )}
                  {values.schoolChoice && values.teacherChoice === NEW_CHOICE && (
                    <div className="space-y-3 rounded-xl bg-slate-50 p-4">
                      {textField('teacherName', 'Teacher name', { required: true })}
                      {textField('teacherEmail', 'Teacher email', {
                        required: true,
                        type: 'email',
                      })}
                      <p className="text-xs text-slate-500">
                        Saved as a contact. Scheduling sends no email.
                      </p>
                    </div>
                  )}
                </div>
              </div>
              {values.schoolChoice && values.teacherChoice && (
                <div className="space-y-3">
                  {selectedClass && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      <p className="font-semibold text-slate-800">Usual teacher availability</p>
                      {selectedClass.meetings.length ? (
                        <ul className="mt-2 space-y-1">
                          {selectedClass.meetings.map((m, i) => (
                            <li key={i}>
                              {DAY_LABELS[m.dayOfWeek]} ·{' '}
                              {formatSlotRange(m.startMinute, m.endMinute - m.startMinute)}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1">No weekly times saved. You can still book this date.</p>
                      )}
                      <p className="mt-2 text-xs">
                        Reference for planning. Confirm the date above with the teacher, including
                        any time outside these usual hours.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </section>

            <details
              ref={advancedRef}
              className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"
            >
              <summary>Advanced staffing</summary>
              <p className="mt-2 text-sm text-slate-600">
                How many PAs this workshop needs. Choose the people after saving.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ['minPAs', 'Minimum PAs'],
                    ['maxPAs', 'Maximum PAs'],
                  ] as const
                ).map(([name, label]) => (
                  <label key={name} className="field">
                    <span>{label}</span>
                    <input
                      aria-label={label}
                      name={name}
                      className="input"
                      type="number"
                      min="1"
                      step="1"
                      value={values[name]}
                      onChange={(event) => update(name, event.target.value)}
                      required
                      {...fieldProps(name)}
                    />
                    {error(name)}
                  </label>
                ))}
              </div>
            </details>
            <div className="form-grid">
              <input type="hidden" name="mode" value="IN_PERSON" />
              <label className="field">
                Location
                <input className="input" name="location" maxLength={500} />
              </label>
              <label className="field">
                Participant instructions
                <textarea className="input" name="participantInstructions" maxLength={5000} />
                <span className="text-xs font-normal text-slate-500">
                  Visible after publication.
                </span>
              </label>
              <label className="field">
                Internal admin notes
                <textarea className="input" name="notes" maxLength={5000} />
                <span className="text-xs font-normal text-slate-500">
                  Only admins can see these notes.
                </span>
              </label>
            </div>
          </div>

          <aside
            aria-label="Teacher session summary"
            className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5 xl:sticky xl:top-6"
          >
            <h2 className="font-semibold text-slate-900">Your workshop</h2>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-xs text-slate-500">WORKSHOP</dt>
                <dd className="mt-1 font-medium">
                  {definitions.find((d) => d.id === values.workshopDefinitionId)?.title ??
                    'Choose a workshop'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">WHEN · VANCOUVER</dt>
                <dd className="mt-1 font-medium">
                  {values.date
                    ? new Intl.DateTimeFormat('en-CA', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        timeZone: 'UTC',
                      }).format(new Date(`${values.date}T12:00:00Z`))
                    : 'Choose a date'}
                </dd>
                <dd className="mt-1">
                  {values.startTime && duration > 0
                    ? formatSlotRange(
                        Number(values.startTime.slice(0, 2)) * 60 +
                          Number(values.startTime.slice(3)),
                        duration
                      )
                    : 'Choose a start and end time'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">HOST</dt>
                <dd className="mt-1 font-medium break-words">{schoolName || 'Choose a school'}</dd>
                <dd className="mt-1 break-words">{hostName || 'Choose a teacher'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">STAFFING</dt>
                <dd className="mt-1">
                  {values.minPAs}–{values.maxPAs} PAs · assigned after saving the date
                </dd>
              </div>
            </dl>
            <p className="border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-600">
              By saving, you confirm this date and time with the host. The workshop stays private
              until you publish it.
            </p>
            <SubmitButton className="w-full">Schedule teacher session</SubmitButton>
            <p className="text-xs text-slate-600">Next: assign PAs, then review and publish.</p>
            <Link
              className="inline-block text-sm underline"
              href={schedulingHref('/admin/workshops', context)}
            >
              Cancel
            </Link>
          </aside>
        </div>
      </ReadyFields>
    </form>
  )
}
