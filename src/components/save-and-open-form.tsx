'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { FormError } from '@/components/form-error'
import { SubmitButton } from '@/components/submit-button'

type SaveResult = { ok: true; destination: string } | { ok: false; error: string }

export function SaveAndOpenForm({
  action,
  children,
  submitLabel,
  successMessage,
}: {
  action: (form: FormData) => Promise<SaveResult>
  children: ReactNode
  submitLabel: string
  successMessage: string
}) {
  const [error, setError] = useState<string>()
  const [savedDestination, setSavedDestination] = useState<string>()
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    const form = formRef.current
    if (!form) return
    // React resets fulfilled actions even when they return a validation error.
    // This runs during commit, when React's synthetic onReset is suppressed.
    // Keep input values until a successful save opens the fresh document.
    const preserveValues = (event: Event) => event.preventDefault()
    form.addEventListener('reset', preserveValues)
    return () => form.removeEventListener('reset', preserveValues)
  }, [])

  useEffect(() => {
    if (savedDestination) window.location.replace(savedDestination)
  }, [savedDestination])

  async function submit(form: FormData) {
    setError(undefined)
    const result = await action(form)
    if (!result.ok) {
      setError(result.error)
      return
    }
    // Commit saved feedback before navigating. The fresh document clears the
    // old router cache without tying the save to a Server Action redirect.
    setSavedDestination(result.destination)
  }

  return (
    <form ref={formRef} action={submit}>
      <SaveFields saved={Boolean(savedDestination)} submitLabel={submitLabel}>
        {children}
      </SaveFields>
      <div className="mt-3">
        <FormError message={error} />
        {savedDestination && (
          <p role="status" className="text-sm text-emerald-800">
            {successMessage} Opening the updated page…{' '}
            <a href={savedDestination} className="font-semibold underline">
              Continue
            </a>
          </p>
        )}
      </div>
    </form>
  )
}

function SaveFields({
  children,
  saved,
  submitLabel,
}: {
  children: ReactNode
  saved: boolean
  submitLabel: string
}) {
  const { pending } = useFormStatus()
  return (
    <fieldset disabled={pending || saved} className="space-y-5">
      {children}
      <SubmitButton disabled={saved} pendingLabel={saved ? 'Opening workshop…' : 'Saving…'}>
        {saved ? 'Opening workshop…' : submitLabel}
      </SubmitButton>
    </fieldset>
  )
}
