import { describe, expect, it } from 'vitest'
import { gapSchema, staffSchema } from './staffing'

describe('calendar-day gap input', () => {
  it.each(['1', '7', '14', '365'])('accepts whole-day gap %s', (minimumGapDays) => {
    expect(gapSchema.parse({ minimumGapDays })).toEqual({ minimumGapDays: Number(minimumGapDays) })
  })
  it.each(['', '0', '-1', '1.5', '366', 'Infinity', 'NaN', '1e2', ' 1 ', '9007199254740993'])(
    'rejects invalid gap %s',
    (minimumGapDays) => {
      expect(gapSchema.safeParse({ minimumGapDays }).success).toBe(false)
    }
  )
  it('rejects omitted, legacy-minute and non-string form values', () => {
    for (const input of [{}, { minimumGapMinutes: '60' }, { minimumGapDays: 1 }])
      expect(gapSchema.safeParse(input).success).toBe(false)
  })
})

describe('manual staffing override input', () => {
  const base = { id: 'workshop', version: '3', paId: 'pa' }

  it('accepts an assignment without workload confirmations or a reason', () => {
    expect(staffSchema.parse(base)).toEqual({
      ...base,
      version: 3,
    })
  })

  it('ignores legacy confirmation and reason fields instead of requiring them', () => {
    expect(
      staffSchema.parse({
        ...base,
        sameDayOverrideConfirmed: 'false',
        weeklyOverrideConfirmed: 'false',
        overrideReason: '',
      })
    ).toEqual({ ...base, version: 3 })
  })

  it('validates the policy hash format when supplied', () => {
    expect(staffSchema.safeParse({ ...base, expectedPolicyHash: 'stale' }).success).toBe(false)
    expect(staffSchema.safeParse({ ...base, expectedPolicyHash: 'a'.repeat(64) }).success).toBe(
      true
    )
  })
})
