import { describe, expect, it } from 'vitest'
import { gapSchema } from './staffing'

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
