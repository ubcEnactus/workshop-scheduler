import { describe, expect, it } from 'vitest'
import {
  normalizeSchedulingContext,
  parseSchedulingContext,
  readSchedulingContext,
  schedulingHref,
} from './navigation'

describe('schedule navigation context', () => {
  it('preserves workshop calendar origin through reviewed session changes', () => {
    const context = parseSchedulingContext({
      from: 'workshop',
      month: '2027-01',
      workshopDefinitionId: 'run',
    })
    const form = new FormData()
    for (const [key, value] of Object.entries(context)) form.set(key, value)
    expect(readSchedulingContext(form)).toEqual(context)
    expect(schedulingHref('/admin/workshops/session', context)).toContain('from=workshop')
    expect(parseSchedulingContext({ from: 'https://external.invalid' })).not.toHaveProperty('from')
  })
  it('keeps directory return filters separate from edited school and class fields', () => {
    const form = new FormData()
    for (const [key, value] of Object.entries({
      month: '2027-01',
      schoolId: 'edited-school',
      returnSchoolId: 'filter-school',
      classSectionId: 'edited-class',
      returnClassSectionId: 'filter-class',
    }))
      form.set(key, value)
    expect(readSchedulingContext(form)).toEqual({
      month: '2027-01',
      schoolId: 'filter-school',
      classSectionId: 'filter-class',
    })
  })
  it('round trips a filtered month without carrying untrusted redirect values', () => {
    const context = parseSchedulingContext({
      month: '2027-01',
      schoolId: 's & 1',
      classSectionId: 'c',
      view: 'ready',
      workshopDefinitionId: 'workshop-1',
      week: '2027-01-04',
      returnTo: 'https://other.test',
    })
    const url = schedulingHref('/admin/workshops/plan', context)
    expect(url).toBe(
      '/admin/workshops/plan?month=2027-01&schoolId=s+%26+1&classSectionId=c&view=ready&workshopDefinitionId=workshop-1&week=2027-01-04'
    )
    expect(
      parseSchedulingContext(Object.fromEntries(new URLSearchParams(url.split('?')[1])))
    ).toEqual(context)
  })
  it('clears deleted and mismatched filters with an explanation', () => {
    const result = normalizeSchedulingContext(
      { month: '2027-01', schoolId: 's1', classSectionId: 'c2' },
      [{ id: 'c2', schoolId: 's2' }],
      [{ id: 's1' }, { id: 's2' }]
    )
    expect(result.context).toEqual({ month: '2027-01', schoolId: 's1' })
    expect(result.warning).toContain('teacher filter was cleared')
    expect(normalizeSchedulingContext({ schoolId: 'deleted' }, [], []).warning).toContain(
      'school filter was cleared'
    )
  })
  it('rejects invalid months, arrays and view values and supports explicit clearing', () => {
    const context = parseSchedulingContext(
      { month: '2027-13', schoolId: ['s'], view: 'bogus' },
      '2027-01'
    )
    expect(context).toEqual({ month: '2027-01' })
    expect(
      schedulingHref('/admin/workshops', { ...context, schoolId: 's' }, { schoolId: undefined })
    ).toBe('/admin/workshops?month=2027-01')
  })
  it('opens class detours in the month containing the preserved planning week', () => {
    expect(
      parseSchedulingContext({
        workshopDefinitionId: 'workshop-1',
        week: '2027-03-29',
      })
    ).toEqual({
      month: '2027-03',
      workshopDefinitionId: 'workshop-1',
      week: '2027-03-29',
    })
  })
})
