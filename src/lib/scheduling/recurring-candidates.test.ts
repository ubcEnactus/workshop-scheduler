import { describe, expect, it } from 'vitest'
import {
  generateClassCandidates,
  MAX_GENERATED_CANDIDATES,
  resolveClassAvailabilityWindowsForDate,
} from './recurring-candidates'
import { vancouverToUtc } from '@/lib/time'

const recurring = [
  {
    id: 'monday',
    dayOfWeek: 0,
    startMinute: 9 * 60,
    endMinute: 12 * 60,
    effectiveFrom: '2026-10-01',
    effectiveUntil: null,
    active: true,
  },
]

describe('generateClassCandidates', () => {
  it('skips only one source and Vancouver date across the daylight-saving boundary', () => {
    const rules = [{ ...recurring[0], skippedDates: ['2026-11-02'] }]
    const result = generateClassCandidates({
      windowStart: '2026-10-26',
      windowEnd: '2026-11-09',
      durationMinutes: 180,
      recurring: rules,
    })
    expect(result.map((item) => item.date)).toEqual(['2026-10-26', '2026-11-09'])
    const date = '2026-11-02'
    expect(
      resolveClassAvailabilityWindowsForDate({
        date,
        recurring: [...rules, { ...recurring[0], id: 'independent' }],
        explicit: [
          { id: 'dated', start: vancouverToUtc(date, 540), end: vancouverToUtc(date, 720) },
        ],
      }).map((item) => item.authorization.id)
    ).toEqual(['independent', 'dated'])
    expect(
      resolveClassAvailabilityWindowsForDate({
        date,
        recurring: rules,
        explicit: [
          { id: 'dated', start: vancouverToUtc(date, 540), end: vancouverToUtc(date, 720) },
        ],
        exceptions: [{ id: 'closure', date, kind: 'CLOSED' }],
      })
    ).toEqual([])
  })
  it('uses workshop duration and 15-minute starts instead of the whole availability window', () => {
    const result = generateClassCandidates({
      windowStart: '2026-10-05',
      windowEnd: '2026-10-05',
      durationMinutes: 60,
      recurring,
    })
    expect(result.map((candidate) => [candidate.startMinute, candidate.endMinute])).toEqual([
      [540, 600],
      [555, 615],
      [570, 630],
      [585, 645],
      [600, 660],
      [615, 675],
      [630, 690],
      [645, 705],
      [660, 720],
    ])
  })

  it('requires explicit activation and respects effective dates', () => {
    expect(
      generateClassCandidates({
        windowStart: '2026-09-28',
        windowEnd: '2026-10-05',
        durationMinutes: 60,
        recurring: [{ ...recurring[0], active: false }],
      })
    ).toEqual([])
    const result = generateClassCandidates({
      windowStart: '2026-09-28',
      windowEnd: '2026-10-05',
      durationMinutes: 180,
      recurring,
    })
    expect(result).toHaveLength(1)
    expect(result[0].date).toBe('2026-10-05')
  })

  it('applies closures after additional availability', () => {
    const result = generateClassCandidates({
      windowStart: '2026-10-06',
      windowEnd: '2026-10-06',
      durationMinutes: 60,
      recurring: [],
      exceptions: [
        {
          id: 'extra',
          date: '2026-10-06',
          startMinute: 540,
          endMinute: 720,
          kind: 'ADDITIONAL',
        },
        {
          id: 'closure',
          date: '2026-10-06',
          kind: 'CLOSED',
        },
      ],
    })
    expect(result).toEqual([])
  })

  it('subtracts partial unavailable intervals', () => {
    const result = generateClassCandidates({
      windowStart: '2026-10-05',
      windowEnd: '2026-10-05',
      durationMinutes: 60,
      recurring,
      exceptions: [
        {
          id: 'break',
          date: '2026-10-05',
          startMinute: 600,
          endMinute: 630,
          kind: 'CLOSED',
        },
      ],
    })
    expect(result.map((candidate) => candidate.startMinute)).toEqual([540, 630, 645, 660])
  })

  it('uses Vancouver conversion correctly across daylight-saving transitions', () => {
    const result = generateClassCandidates({
      windowStart: '2027-03-12',
      windowEnd: '2027-03-15',
      durationMinutes: 180,
      recurring,
    })
    expect(result).toHaveLength(1)
    expect(result[0].start.toISOString()).toBe('2027-03-15T16:00:00.000Z')
    expect(result[0].end.toISOString()).toBe('2027-03-15T19:00:00.000Z')
  })

  it('derives explicit wall-clock minutes without using elapsed UTC time from midnight', () => {
    const result = generateClassCandidates({
      windowStart: '2027-03-14',
      windowEnd: '2027-03-14',
      durationMinutes: 60,
      recurring: [],
      explicit: [
        {
          id: 'dst-window',
          start: vancouverToUtc('2027-03-14', 540),
          end: vancouverToUtc('2027-03-14', 660),
        },
      ],
    })
    expect(result[0]).toMatchObject({ date: '2027-03-14', startMinute: 540, endMinute: 600 })
    expect(result.at(-1)).toMatchObject({ startMinute: 600, endMinute: 660 })
  })

  it('deduplicates compatible sources and bounds the planning horizon and output', () => {
    const result = generateClassCandidates({
      windowStart: '2026-01-01',
      windowEnd: '2030-01-01',
      durationMinutes: 15,
      recurring: [recurring[0], { ...recurring[0], id: 'duplicate' }],
      maxCandidates: Number.MAX_SAFE_INTEGER,
    })
    expect(result.length).toBeLessThanOrEqual(MAX_GENERATED_CANDIDATES)
    expect(new Set(result.map((candidate) => candidate.key)).size).toBe(result.length)
    expect((result.at(-1)?.date ?? '') <= '2027-01-05').toBe(true)
  })
})

describe('resolveClassAvailabilityWindowsForDate', () => {
  it('returns effective weekly and extra availability with their source', () => {
    const result = resolveClassAvailabilityWindowsForDate({
      date: '2026-10-05',
      recurring,
      exceptions: [
        {
          id: 'extra',
          date: '2026-10-05',
          startMinute: 780,
          endMinute: 840,
          kind: 'ADDITIONAL',
        },
      ],
    })

    expect(result).toEqual([
      {
        startMinute: 540,
        endMinute: 720,
        authorization: { kind: 'RECURRING', id: 'monday' },
      },
      {
        startMinute: 780,
        endMinute: 840,
        authorization: { kind: 'ADDITIONAL', id: 'extra' },
      },
    ])
  })

  it('applies partial and whole-day closures after every positive source', () => {
    const partial = resolveClassAvailabilityWindowsForDate({
      date: '2026-10-05',
      recurring,
      exceptions: [
        {
          id: 'extra',
          date: '2026-10-05',
          startMinute: 690,
          endMinute: 750,
          kind: 'ADDITIONAL',
        },
        {
          id: 'school-break',
          date: '2026-10-05',
          startMinute: 600,
          endMinute: 705,
          kind: 'CLOSED',
        },
      ],
    })
    expect(partial).toEqual([
      {
        startMinute: 540,
        endMinute: 600,
        authorization: { kind: 'RECURRING', id: 'monday' },
      },
      {
        startMinute: 705,
        endMinute: 720,
        authorization: { kind: 'RECURRING', id: 'monday' },
      },
      {
        startMinute: 705,
        endMinute: 750,
        authorization: { kind: 'ADDITIONAL', id: 'extra' },
      },
    ])

    expect(
      resolveClassAvailabilityWindowsForDate({
        date: '2026-10-05',
        recurring,
        exceptions: [{ id: 'closed', date: '2026-10-05', kind: 'CLOSED' }],
      })
    ).toEqual([])
  })

  it('excludes inactive, out-of-weekday, and out-of-effective-range blocks', () => {
    expect(
      resolveClassAvailabilityWindowsForDate({
        date: '2026-09-28',
        recurring: [
          { ...recurring[0], id: 'future' },
          { ...recurring[0], id: 'inactive', active: false, effectiveFrom: '2026-01-01' },
          { ...recurring[0], id: 'tuesday', dayOfWeek: 1, effectiveFrom: '2026-01-01' },
          {
            ...recurring[0],
            id: 'expired',
            effectiveFrom: '2026-01-01',
            effectiveUntil: '2026-09-27',
          },
        ],
      })
    ).toEqual([])
  })
})
