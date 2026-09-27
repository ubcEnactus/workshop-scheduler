import { describe, expect, it } from 'vitest'
import {
  currentWorkshopStep,
  workshopDateProgress,
  workshopNextStepKind,
  type WorkshopOverviewCounts,
} from './workshop-overview'

const empty: WorkshopOverviewCounts = {
  included: 0,
  publishedDeficits: 0,
  windowEnded: 0,
  staffedDrafts: 0,
  needPAs: 0,
  needDates: 0,
  teacherContactsNeedReview: 0,
  needAvailability: 0,
  published: 0,
}

describe('workshop overview next step', () => {
  it.each([
    [{}, 'ADD_CLASSES'],
    [{ included: 1, publishedDeficits: 1 }, 'PUBLISHED_DEFICIT'],
    [{ included: 1, windowEnded: 1 }, 'WINDOW_ENDED'],
    [{ included: 1, staffedDrafts: 1 }, 'REVIEW_DRAFTS'],
    [{ included: 1, needPAs: 1 }, 'ASSIGN_PAS'],
    [{ included: 1, needDates: 1 }, 'CHOOSE_DATES'],
    [{ included: 1, teacherContactsNeedReview: 1 }, 'REVIEW_TEACHERS'],
    [{ included: 1, needAvailability: 1 }, 'ADD_AVAILABILITY'],
    [{ included: 1, published: 1 }, 'MANAGE_PUBLISHED'],
    [{ included: 1 }, 'ALL_CLEAR'],
  ] as const)('selects %s as %s', (overrides, expected) => {
    expect(workshopNextStepKind({ ...empty, ...overrides })).toBe(expected)
  })

  it('advances actionable cohorts before availability blockers in mixed workshops', () => {
    const counts = {
      ...empty,
      included: 4,
      needDates: 2,
      teacherContactsNeedReview: 1,
      needAvailability: 1,
    }
    expect(workshopNextStepKind(counts)).toBe('CHOOSE_DATES')
    expect(currentWorkshopStep(counts)).toBe(2)
  })

  it('prioritizes published deficits over every draft action', () => {
    const counts = {
      ...empty,
      included: 4,
      publishedDeficits: 1,
      staffedDrafts: 1,
      needPAs: 1,
      needDates: 1,
    }
    expect(workshopNextStepKind(counts)).toBe('PUBLISHED_DEFICIT')
    expect(currentWorkshopStep(counts)).toBe(4)
  })

  it('does not imply another scheduling step after the delivery window ends', () => {
    expect(currentWorkshopStep({ ...empty, included: 1, windowEnded: 1 })).toBeUndefined()
  })
})

describe('workshop overview progress', () => {
  it('does not count waived classes as requiring dates', () => {
    expect(workshopDateProgress(2, 3, 1)).toBe('2 of 2 dated')
    expect(workshopDateProgress(0, 3, 3)).toBe('No dates required')
  })
})
