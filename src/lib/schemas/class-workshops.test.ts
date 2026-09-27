import { describe, expect, it } from 'vitest'
import { definitionSchema, enrollmentSelectionSchema } from './class-workshops'

describe('definitionSchema', () => {
  const base = {
    title: 'Building a Business · October',
    number: '',
    description: '',
    durationMinutes: '60',
    defaultMinPAs: '1',
    defaultMaxPAs: '3',
    deliveryStart: '2026-10-05',
    deliveryEnd: '2026-10-23',
  }

  it('accepts a title-first run without a workshop number', () => {
    const parsed = definitionSchema.parse(base)
    expect(parsed.number).toBeUndefined()
    expect(parsed.title).toBe(base.title)
  })

  it('requires a shared window for a new run', () => {
    expect(
      definitionSchema.safeParse({ ...base, deliveryStart: '', deliveryEnd: '' }).success
    ).toBe(false)
  })

  it('allows a legacy existing run to remain visibly unset until reviewed', () => {
    expect(
      definitionSchema.safeParse({
        ...base,
        id: 'legacy-run',
        deliveryStart: '',
        deliveryEnd: '',
      }).success
    ).toBe(true)
  })
})

describe('enrollmentSelectionSchema', () => {
  it('requires at least one run and class for an explicit enrollment', () => {
    expect(
      enrollmentSelectionSchema.safeParse({
        runIds: [],
        classSectionIds: ['class-a'],
        requestKey: 'request-123',
      }).success
    ).toBe(false)
    expect(
      enrollmentSelectionSchema.safeParse({
        runIds: ['run-a'],
        classSectionIds: ['class-a'],
        requestKey: 'request-123',
      }).success
    ).toBe(true)
  })
})
