import { describe, expect, it } from 'vitest'
import { needsCommunication } from './communication'

const state = {
  status: 'PUBLISHED',
  start: '2027-01-04T18:00:00Z',
  end: '2027-01-04T19:00:00Z',
  pas: [{ id: 'pa', name: 'PA' }],
  notes: 'Internal',
}
describe('communication tasks', () => {
  it('excludes private note-only edits and completion', () => {
    expect(
      needsCommunication({
        kind: 'EDIT',
        wasPublished: true,
        before: state,
        after: { ...state, notes: 'New internal note', dateExceptionReason: 'Private approval' },
      })
    ).toBe(false)
    expect(
      needsCommunication({
        kind: 'COMPLETE',
        wasPublished: true,
        before: state,
        after: { ...state, status: 'COMPLETED' },
      })
    ).toBe(false)
  })
  it('includes publication, cancellation, staff changes and participant instructions', () => {
    expect(
      needsCommunication({ kind: 'PUBLISH', wasPublished: true, before: state, after: state })
    ).toBe(true)
    for (const after of [
      { ...state, status: 'CANCELLED' },
      { ...state, pas: [] },
      { ...state, participantInstructions: 'Bring a laptop.' },
    ])
      expect(needsCommunication({ kind: 'EDIT', wasPublished: true, before: state, after })).toBe(
        true
      )
    expect(
      needsCommunication({
        kind: 'EDIT',
        wasPublished: false,
        before: state,
        after: { ...state, pas: [] },
      })
    ).toBe(false)
  })
})
