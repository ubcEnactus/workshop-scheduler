import { describe, expect, it } from 'vitest'

import { participantChangeSummary } from './participant-change-summary'

const state = {
  status: 'PUBLISHED',
  start: '2027-01-04T18:00:00.000Z',
  end: '2027-01-04T19:00:00.000Z',
  pas: [{ id: 'pa-1', name: 'One' }],
  notes: 'Private admin note',
  dateExceptionReason: 'Private approval reason',
}

describe('participantChangeSummary', () => {
  it('names supported public changes without exposing internal notes or reasons', () => {
    const summary = participantChangeSummary({
      kind: 'EDIT',
      before: state,
      after: {
        ...state,
        start: '2027-01-04T18:15:00.000Z',
        end: '2027-01-04T19:15:00.000Z',
        participantInstructions: 'Meet at the library.',
        notes: 'Sensitive follow-up',
        dateExceptionReason: 'Internal exception',
      },
    })

    expect(summary).toBe('date or time, instructions were updated.')
    expect(summary).not.toContain('Sensitive')
    expect(summary).not.toContain('Internal')
  })

  it('uses fixed participant-safe cancellation and fallback text', () => {
    expect(participantChangeSummary({ kind: 'CANCEL', before: null, after: null })).toBe(
      'This workshop was cancelled.'
    )
    expect(participantChangeSummary({ kind: 'EDIT', before: null, after: null })).toBe(
      'Workshop details were updated.'
    )
  })
})
