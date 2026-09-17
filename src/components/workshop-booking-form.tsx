'use client'

import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { ReadyFields } from '@/components/ready-fields'
import { SubmitButton } from '@/components/submit-button'
import type { WorkshopFormState } from '@/lib/schemas/form-state'
import type { SchedulingContext } from '@/lib/scheduling/navigation'

const NEW_CHOICE = '__new__'

export type BookingSchool = { id: string; name: string; district: string }
export type BookingTeacher = {
  id: string
  name: string | null
  email: string
  schoolId: string
}
export type BookingClass = {
  id: string
  name: string
  schoolId: string
  teacherId: string
  defaultDurationMinutes: number
  defaultMinPAs: number
  defaultMaxPAs: number
}

function endTimeFor(startTime: string, durationMinutes: number) {
  const match = /^(\d{2}):(\d{2})$/.exec(startTime)
  if (!match) return ''
  const end = Number(match[1]) * 60 + Number(match[2]) + durationMinutes
  if (end >= 24 * 60) return ''
  return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`
}

type Values = {
  schoolChoice: string
  schoolName: string
  schoolDistrict: string
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

function FieldError({ name, state }: { name: keyof Values; state: WorkshopFormState }) {
  const message = state.fields?.[name]
  if (!message) return null
  return (
    <span id={`booking-error-${name}`} className="text-xs text-red-800">
      {message}
    </span>
  )
}

export function WorkshopBookingForm({
  action,
  requestKey,
  schools,
  teachers,
  classes,
  context,
}: {
  action: (state: WorkshopFormState, form: FormData) => Promise<WorkshopFormState>
  requestKey: string
  schools: BookingSchool[]
  teachers: BookingTeacher[]
  classes: BookingClass[]
  context: SchedulingContext
}) {
  const initialClass = classes.find((item) => item.id === context.classSectionId)
  const initialSchoolId =
    initialClass?.schoolId ?? schools.find((s) => s.id === context.schoolId)?.id
  const initialTeacher = teachers.find((item) => item.id === initialClass?.teacherId)
  const [values, setValues] = useState<Values>({
    schoolChoice: initialSchoolId ?? NEW_CHOICE,
    schoolName: '',
    schoolDistrict: '',
    teacherChoice: initialTeacher?.id ?? NEW_CHOICE,
    teacherName: '',
    teacherEmail: '',
    classChoice: initialClass?.id ?? NEW_CHOICE,
    className: '',
    date: '',
    startTime: '',
    endTime: '',
    minPAs: String(initialClass?.defaultMinPAs ?? 1),
    maxPAs: String(initialClass?.defaultMaxPAs ?? 3),
  })
  const [endTimeManuallyEdited, setEndTimeManuallyEdited] = useState(false)
  const [state, formAction, pending] = useActionState(action, {})
  const formRef = useRef<HTMLFormElement>(null)
  const advancedRef = useRef<HTMLDetailsElement>(null)

  const availableTeachers = useMemo(
    () =>
      values.schoolChoice === NEW_CHOICE
        ? []
        : teachers.filter((teacher) => teacher.schoolId === values.schoolChoice),
    [teachers, values.schoolChoice]
  )
  const availableClasses = useMemo(
    () =>
      values.teacherChoice === NEW_CHOICE
        ? []
        : classes.filter(
            (item) =>
              item.schoolId === values.schoolChoice && item.teacherId === values.teacherChoice
          ),
    [classes, values.schoolChoice, values.teacherChoice]
  )
  const selectedSchool = schools.find((item) => item.id === values.schoolChoice)
  const selectedTeacher = teachers.find((item) => item.id === values.teacherChoice)
  const selectedClass = classes.find((item) => item.id === values.classChoice)

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
    if (classId === NEW_CHOICE) {
      setValues((current) => ({
        ...current,
        classChoice: NEW_CHOICE,
        className: '',
        endTime: endTimeManuallyEdited ? current.endTime : endTimeFor(current.startTime, 60),
        minPAs: '1',
        maxPAs: '3',
      }))
      return
    }
    const item = classes.find((candidate) => candidate.id === classId)
    if (!item) return
    setValues((current) => ({
      ...current,
      classChoice: item.id,
      className: '',
      schoolChoice: item.schoolId,
      schoolName: '',
      schoolDistrict: '',
      teacherChoice: item.teacherId,
      teacherName: '',
      teacherEmail: '',
      endTime: endTimeManuallyEdited
        ? current.endTime
        : endTimeFor(current.startTime, item.defaultDurationMinutes),
      minPAs: String(item.defaultMinPAs),
      maxPAs: String(item.defaultMaxPAs),
    }))
  }

  function invalid(name: keyof Values) {
    return state.fields?.[name] ? true : undefined
  }

  function describedBy(name: keyof Values) {
    return state.fields?.[name] ? `booking-error-${name}` : undefined
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-6" noValidate>
      <ReadyFields disabled={pending}>
        <input type="hidden" name="requestKey" value={requestKey} />
        <input type="hidden" name="month" value={context.month} />
        <input type="hidden" name="schoolId" value={context.schoolId ?? ''} />
        <input type="hidden" name="returnClassSectionId" value={context.classSectionId ?? ''} />
        <input type="hidden" name="view" value={context.view ?? ''} />

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

        <section aria-labelledby="booking-class-heading" className="space-y-4">
          <div>
            <h2 id="booking-class-heading" className="text-lg font-semibold text-slate-900">
              School, teacher and class
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Choose a saved class for the quickest booking, or add the details here. New details
              are saved for the next workshop.
            </p>
          </div>

          <label className="field">
            <span>Use a saved class</span>
            <select
              aria-label="Use a saved class"
              className="input"
              name="classChoice"
              value={values.classChoice}
              onChange={(event) => chooseClass(event.target.value)}
              aria-invalid={invalid('classChoice')}
              aria-describedby={describedBy('classChoice')}
            >
              <option value={NEW_CHOICE}>Add a new class</option>
              {classes.map((item) => {
                const school = schools.find((candidate) => candidate.id === item.schoolId)
                const teacher = teachers.find((candidate) => candidate.id === item.teacherId)
                return (
                  <option key={item.id} value={item.id}>
                    {item.name} · {school?.name} · {teacher?.name ?? teacher?.email}
                  </option>
                )
              })}
            </select>
            <FieldError name="classChoice" state={state} />
          </label>

          {values.classChoice !== NEW_CHOICE ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
              <p className="font-semibold">{selectedClass?.name}</p>
              <p className="mt-1">
                {selectedSchool?.name} · {selectedTeacher?.name ?? selectedTeacher?.email}
              </p>
            </div>
          ) : (
            <div className="grid min-w-0 gap-5 lg:grid-cols-3">
              <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4">
                <legend className="px-1 text-sm font-semibold">School</legend>
                <label className="field">
                  <span>Choose or add a school</span>
                  <select
                    aria-label="Choose or add a school"
                    className="input"
                    name="schoolChoice"
                    value={values.schoolChoice}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        schoolChoice: event.target.value,
                        schoolName: '',
                        schoolDistrict: '',
                        teacherChoice: NEW_CHOICE,
                        teacherName: '',
                        teacherEmail: '',
                        classChoice: NEW_CHOICE,
                        className: '',
                        minPAs: '1',
                        maxPAs: '3',
                      }))
                    }
                    aria-invalid={invalid('schoolChoice')}
                    aria-describedby={describedBy('schoolChoice')}
                  >
                    <option value={NEW_CHOICE}>Add a new school</option>
                    {schools.map((school) => (
                      <option key={school.id} value={school.id}>
                        {school.name}
                      </option>
                    ))}
                  </select>
                  <FieldError name="schoolChoice" state={state} />
                </label>
                {values.schoolChoice === NEW_CHOICE && (
                  <>
                    <label className="field">
                      <span>School name</span>
                      <input
                        aria-label="School name"
                        className="input"
                        name="schoolName"
                        value={values.schoolName}
                        onChange={(event) => update('schoolName', event.target.value)}
                        required
                        autoComplete="organization"
                        aria-invalid={invalid('schoolName')}
                        aria-describedby={describedBy('schoolName')}
                      />
                      <FieldError name="schoolName" state={state} />
                    </label>
                    <label className="field">
                      <span>School district (optional)</span>
                      <input
                        aria-label="School district (optional)"
                        className="input"
                        name="schoolDistrict"
                        value={values.schoolDistrict}
                        onChange={(event) => update('schoolDistrict', event.target.value)}
                        aria-invalid={invalid('schoolDistrict')}
                        aria-describedby={describedBy('schoolDistrict')}
                      />
                      <FieldError name="schoolDistrict" state={state} />
                    </label>
                  </>
                )}
              </fieldset>

              <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4">
                <legend className="px-1 text-sm font-semibold">Teacher</legend>
                <label className="field">
                  <span>Choose or add a teacher</span>
                  <select
                    aria-label="Choose or add a teacher"
                    className="input"
                    name="teacherChoice"
                    value={values.teacherChoice}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        teacherChoice: event.target.value,
                        teacherName: '',
                        teacherEmail: '',
                        classChoice: NEW_CHOICE,
                        className: '',
                        minPAs: '1',
                        maxPAs: '3',
                      }))
                    }
                    aria-invalid={invalid('teacherChoice')}
                    aria-describedby={describedBy('teacherChoice')}
                  >
                    <option value={NEW_CHOICE}>Add a new teacher</option>
                    {availableTeachers.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.name ?? teacher.email}
                      </option>
                    ))}
                  </select>
                  <FieldError name="teacherChoice" state={state} />
                </label>
                {values.teacherChoice === NEW_CHOICE && (
                  <>
                    <label className="field">
                      <span>Teacher name</span>
                      <input
                        aria-label="Teacher name"
                        className="input"
                        name="teacherName"
                        value={values.teacherName}
                        onChange={(event) => update('teacherName', event.target.value)}
                        required
                        autoComplete="name"
                        aria-invalid={invalid('teacherName')}
                        aria-describedby={describedBy('teacherName')}
                      />
                      <FieldError name="teacherName" state={state} />
                    </label>
                    <label className="field">
                      <span>Teacher email</span>
                      <input
                        aria-label="Teacher email"
                        className="input"
                        name="teacherEmail"
                        type="email"
                        value={values.teacherEmail}
                        onChange={(event) => update('teacherEmail', event.target.value)}
                        required
                        autoComplete="email"
                        aria-invalid={invalid('teacherEmail')}
                        aria-describedby={describedBy('teacherEmail')}
                      />
                      <FieldError name="teacherEmail" state={state} />
                    </label>
                  </>
                )}
              </fieldset>

              <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4">
                <legend className="px-1 text-sm font-semibold">Class</legend>
                {availableClasses.length > 0 && (
                  <label className="field">
                    <span>Choose or add a class</span>
                    <select
                      aria-label="Choose or add a class"
                      className="input"
                      value={values.classChoice}
                      onChange={(event) => chooseClass(event.target.value)}
                    >
                      <option value={NEW_CHOICE}>Add a new class</option>
                      {availableClasses.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="field">
                  <span>Class name</span>
                  <input
                    aria-label="Class name"
                    className="input"
                    name="className"
                    value={values.className}
                    onChange={(event) => update('className', event.target.value)}
                    required
                    placeholder="e.g. Period 3 Biology"
                    aria-invalid={invalid('className')}
                    aria-describedby={describedBy('className')}
                  />
                  <FieldError name="className" state={state} />
                </label>
              </fieldset>
            </div>
          )}
          {values.classChoice !== NEW_CHOICE && (
            <>
              <input type="hidden" name="schoolChoice" value={values.schoolChoice} />
              <input type="hidden" name="teacherChoice" value={values.teacherChoice} />
            </>
          )}
        </section>

        <section aria-labelledby="booking-time-heading" className="space-y-4">
          <div>
            <h2 id="booking-time-heading" className="text-lg font-semibold text-slate-900">
              Confirm the workshop time
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              This date and time are confirmed for this booking. Weekly class availability is
              optional and can be added later for month planning.
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
                  value={values[name]}
                  onChange={(event) => {
                    const value = event.target.value
                    if (name === 'startTime') {
                      const duration = selectedClass?.defaultDurationMinutes ?? 60
                      setValues((current) => ({
                        ...current,
                        startTime: value,
                        endTime: endTimeManuallyEdited
                          ? current.endTime
                          : endTimeFor(value, duration),
                      }))
                    } else if (name === 'endTime') {
                      setEndTimeManuallyEdited(true)
                      update(name, value)
                    } else {
                      update(name, value)
                    }
                  }}
                  required
                  aria-invalid={invalid(name)}
                  aria-describedby={describedBy(name)}
                />
                <FieldError name={name} state={state} />
              </label>
            ))}
          </div>
        </section>

        <details
          ref={advancedRef}
          className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"
        >
          <summary>Advanced staffing</summary>
          <p className="mt-2 text-sm text-slate-600">
            These defaults can be changed for this workshop without changing the saved class.
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
                  className="input"
                  name={name}
                  type="number"
                  min="1"
                  step="1"
                  value={values[name]}
                  onChange={(event) => update(name, event.target.value)}
                  required
                  aria-invalid={invalid(name)}
                  aria-describedby={describedBy(name)}
                />
                <FieldError name={name} state={state} />
              </label>
            ))}
          </div>
        </details>

        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton>Book workshop</SubmitButton>
          <p className="text-xs text-slate-500">
            The booking is saved as a private draft with its host confirmation recorded.
          </p>
        </div>
      </ReadyFields>
    </form>
  )
}
