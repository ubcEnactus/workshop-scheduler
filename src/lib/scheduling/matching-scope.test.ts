import { describe, expect, it } from 'vitest'

import { parseStoredMatchingScope } from '@/lib/schemas/matching'
import { matchingScopeHref } from './matching-scope'

describe('matching scope', () => {
  it('preserves a workshop and saved planning batch across navigation', () => {
    const href = matchingScopeHref(
      '/admin/workshops',
      { kind: 'batch', workshopDefinitionId: 'run-1', batchId: 'batch-1' },
      {
        month: '2027-01',
        schoolId: 'old-school',
        classSectionId: 'old-class',
        workshopDefinitionId: 'old-run',
        batch: 'old-batch',
      },
      { matched: '1' }
    )
    const query = new URLSearchParams(href.split('?')[1])
    expect(query.getAll('workshopDefinitionId')).toEqual(['run-1'])
    expect(query.getAll('batch')).toEqual(['batch-1'])
    expect(query.get('matched')).toBe('1')
    expect(query.has('schoolId')).toBe(false)
    expect(query.has('classSectionId')).toBe(false)
  })

  it('round trips repeated selected sessions and clears incompatible context', () => {
    const href = matchingScopeHref(
      '/admin/workshops',
      {
        kind: 'sessions',
        workshopDefinitionId: 'run-2',
        workshopSessionIds: ['session-1', 'session-2'],
      },
      { month: '2027-01', workshopDefinitionId: 'old-run', batch: 'old-batch' }
    )
    const query = new URLSearchParams(href.split('?')[1])
    expect(query.getAll('workshopDefinitionId')).toEqual(['run-2'])
    expect(query.getAll('sessionId')).toEqual(['session-1', 'session-2'])
    expect(query.has('batch')).toBe(false)
  })

  it('reads old preview class arrays as an explicit legacy month scope', () => {
    expect(parseStoredMatchingScope('2027-01', ['class-1'])).toEqual({
      kind: 'month',
      month: '2027-01',
      classIds: ['class-1'],
    })
  })

  it('rejects an empty selected-session scope', () => {
    expect(() =>
      parseStoredMatchingScope('2027-01', {
        kind: 'sessions',
        workshopDefinitionId: 'run-1',
        workshopSessionIds: [],
      })
    ).toThrow()
  })
})
