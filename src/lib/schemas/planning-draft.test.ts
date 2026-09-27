import { describe, expect, it } from 'vitest'
import {
  restorePlanningDraft,
  removeSavedPlanningChoices,
  type PlanningDraft,
} from './planning-draft'

describe('retained workshop date choices', () => {
  const choice = {
    id: '2027-01-04:540',
    date: '2027-01-04',
    startTime: '09:00',
    label: 'Jan 4, 9am',
  }
  const draft: PlanningDraft = {
    selected: { first: choice, savedElsewhere: choice },
    mode: 'IN_PERSON',
    location: 'Link',
    participantInstructions: 'Bring questions',
    notes: 'Admin only',
  }
  it('clears only matching saved choices, preserving a later replacement and other unsaved dates', () => {
    const changed = {
      ...draft,
      selected: { ...draft.selected, first: { ...choice, date: '2027-02-01' } },
    }
    expect(
      removeSavedPlanningChoices(changed, [
        { classWorkshopId: 'first', date: choice.date, startTime: choice.startTime },
      ])
    ).toEqual(changed)
    expect(
      removeSavedPlanningChoices(draft, [
        { classWorkshopId: 'first', date: choice.date, startTime: choice.startTime },
      ]).selected
    ).toEqual({ savedElsewhere: choice })
  })
  it('retains off-week choices and session details, but removes classes already saved or removed', () => {
    expect(restorePlanningDraft(JSON.stringify(draft), ['first'])).toEqual({
      ...draft,
      selected: { first: choice },
    })
  })
  it('rejects corrupt browser state and invalid dates or increments', () => {
    expect(restorePlanningDraft('broken', ['first'])).toBeUndefined()
    for (const patch of [{ date: '2027-02-30' }, { startTime: '09:07' }]) {
      expect(
        restorePlanningDraft(
          JSON.stringify({ ...draft, selected: { first: { ...choice, ...patch } } }),
          ['first']
        )
      ).toBeUndefined()
    }
  })
})
