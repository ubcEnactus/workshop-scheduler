import { vancouverDateKey, vancouverMinuteOfDay, vancouverToUtc } from '@/lib/time'

export const PLANNING_INCREMENT_MINUTES = 15
export const MAX_PLANNING_DAYS = 370
export const MAX_GENERATED_CANDIDATES = 2_000

export type RecurringClassAvailability = {
  id: string
  dayOfWeek: number
  startMinute: number
  endMinute: number
  effectiveFrom: string
  effectiveUntil?: string | null
  active: boolean
  skippedDates?: string[]
}

export type DatedClassAvailability = {
  id: string
  date: string
  startMinute?: number | null
  endMinute?: number | null
  kind: 'ADDITIONAL' | 'CLOSED'
}

export type ExplicitAvailabilityWindow = {
  id: string
  start: Date
  end: Date
}

export type CandidateAuthorization =
  | { kind: 'RECURRING'; id: string }
  | { kind: 'ADDITIONAL'; id: string }
  | { kind: 'EXPLICIT'; id: string }

export type GeneratedClassCandidate = {
  key: string
  date: string
  startMinute: number
  endMinute: number
  start: Date
  end: Date
  authorization: CandidateAuthorization
}

type CandidateInput = {
  windowStart: string
  windowEnd: string
  durationMinutes: number
  recurring: RecurringClassAvailability[]
  exceptions?: DatedClassAvailability[]
  explicit?: ExplicitAvailabilityWindow[]
  incrementMinutes?: number
  maxCandidates?: number
}

export type ClassCandidateContext = {
  windowStart: Date | string
  windowEnd: Date | string
  durationMinutes: number
  meetings: {
    id: string
    dayOfWeek: number
    startMinute: number
    endMinute: number
    effectiveFrom: Date | string
    effectiveUntil?: Date | string | null
    activeForScheduling: boolean
    skips?: { date: Date | string }[]
  }[]
  exceptions?: {
    id: string
    date: Date | string
    kind: 'CLOSED' | 'ADDITIONAL'
    startMinute?: number | null
    endMinute?: number | null
  }[]
  schoolClosures?: {
    id: string
    date: Date | string
    startMinute?: number | null
    endMinute?: number | null
  }[]
  explicit?: ExplicitAvailabilityWindow[]
  maxCandidates?: number
}

export type ResolvedClassAvailabilityWindow = {
  startMinute: number
  endMinute: number
  authorization: CandidateAuthorization
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function datesBetween(start: string, end: string): string[] {
  if (!isCalendarDate(start) || !isCalendarDate(end) || end < start) return []
  const dates: string[] = []
  const cursor = new Date(`${start}T12:00:00Z`)
  const last = new Date(`${end}T12:00:00Z`)
  while (cursor <= last && dates.length < MAX_PLANNING_DAYS) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

function validMinuteWindow(startMinute: number, endMinute: number): boolean {
  return (
    Number.isInteger(startMinute) &&
    Number.isInteger(endMinute) &&
    startMinute >= 0 &&
    endMinute <= 24 * 60 &&
    startMinute < endMinute
  )
}

function subtractWindow(
  window: ResolvedClassAvailabilityWindow,
  blocked: DatedClassAvailability
): ResolvedClassAvailabilityWindow[] {
  if (blocked.startMinute == null && blocked.endMinute == null) return []
  if (
    blocked.startMinute == null ||
    blocked.endMinute == null ||
    !validMinuteWindow(blocked.startMinute, blocked.endMinute) ||
    blocked.endMinute <= window.startMinute ||
    blocked.startMinute >= window.endMinute
  )
    return [window]
  const result: ResolvedClassAvailabilityWindow[] = []
  if (blocked.startMinute > window.startMinute)
    result.push({ ...window, endMinute: Math.min(blocked.startMinute, window.endMinute) })
  if (blocked.endMinute < window.endMinute)
    result.push({ ...window, startMinute: Math.max(blocked.endMinute, window.startMinute) })
  return result
}

function weekday(date: string): number {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7
}

function explicitMinuteWindow(
  date: string,
  item: ExplicitAvailabilityWindow
): ResolvedClassAvailabilityWindow | null {
  if (vancouverDateKey(item.start) !== date) return null
  const startMinute = vancouverMinuteOfDay(item.start)
  let endMinute: number
  if (vancouverDateKey(item.end) === date) endMinute = vancouverMinuteOfDay(item.end)
  else {
    const next = new Date(`${date}T12:00:00Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    if (
      vancouverDateKey(item.end) !== next.toISOString().slice(0, 10) ||
      vancouverMinuteOfDay(item.end) !== 0
    )
      return null
    endMinute = 1440
  }
  return validMinuteWindow(startMinute, endMinute)
    ? { startMinute, endMinute, authorization: { kind: 'EXPLICIT', id: item.id } }
    : null
}

/**
 * Resolve the availability windows that authorize scheduling on one Vancouver date.
 *
 * The result keeps the source authorization so callers can explain whether a window
 * comes from the weekly schedule, a dated addition, or a saved legacy candidate.
 * Dated unavailable intervals are applied last, including to dated additions.
 */
export function resolveClassAvailabilityWindowsForDate(input: {
  date: string
  recurring: RecurringClassAvailability[]
  exceptions?: DatedClassAvailability[]
  explicit?: ExplicitAvailabilityWindow[]
}): ResolvedClassAvailabilityWindow[] {
  if (!isCalendarDate(input.date)) return []
  const positive: ResolvedClassAvailabilityWindow[] = []
  const day = weekday(input.date)
  for (const rule of input.recurring) {
    if (
      rule.active &&
      !rule.skippedDates?.includes(input.date) &&
      rule.dayOfWeek === day &&
      rule.effectiveFrom <= input.date &&
      (!rule.effectiveUntil || input.date <= rule.effectiveUntil) &&
      validMinuteWindow(rule.startMinute, rule.endMinute)
    )
      positive.push({
        startMinute: rule.startMinute,
        endMinute: rule.endMinute,
        authorization: { kind: 'RECURRING', id: rule.id },
      })
  }
  for (const item of input.exceptions ?? []) {
    if (item.date !== input.date || item.kind !== 'ADDITIONAL') continue
    const startMinute = item.startMinute
    const endMinute = item.endMinute
    if (startMinute == null || endMinute == null || !validMinuteWindow(startMinute, endMinute))
      continue
    positive.push({
      startMinute,
      endMinute,
      authorization: { kind: 'ADDITIONAL', id: item.id },
    })
  }
  for (const item of input.explicit ?? []) {
    const window = explicitMinuteWindow(input.date, item)
    if (window) positive.push(window)
  }

  const unavailable = (input.exceptions ?? []).filter(
    (item) => item.date === input.date && item.kind === 'CLOSED'
  )
  return unavailable.reduce<ResolvedClassAvailabilityWindow[]>(
    (windows, blocked) => windows.flatMap((window) => subtractWindow(window, blocked)),
    positive
  )
}

/**
 * Expand reusable class availability into concrete workshop starts.
 *
 * The availability window only authorizes a time; `durationMinutes` determines
 * the proposed session length. Unavailable exceptions are applied after all
 * positive sources, so an additional window cannot silently defeat a closure.
 */
export function generateClassCandidates(input: CandidateInput): GeneratedClassCandidate[] {
  const increment = input.incrementMinutes ?? PLANNING_INCREMENT_MINUTES
  const maximum = Math.min(
    Math.max(input.maxCandidates ?? MAX_GENERATED_CANDIDATES, 1),
    MAX_GENERATED_CANDIDATES
  )
  if (
    !Number.isInteger(input.durationMinutes) ||
    input.durationMinutes < 1 ||
    input.durationMinutes > 24 * 60 ||
    !Number.isInteger(increment) ||
    increment < 1 ||
    increment > 60
  )
    return []

  const dates = datesBetween(input.windowStart, input.windowEnd)
  if (!dates.length) return []
  const exceptions = input.exceptions ?? []
  const explicit = input.explicit ?? []
  const candidates: GeneratedClassCandidate[] = []
  const seen = new Set<string>()

  for (const date of dates) {
    const allowed = resolveClassAvailabilityWindowsForDate({
      date,
      recurring: input.recurring,
      exceptions,
      explicit,
    })

    for (const window of allowed) {
      for (
        let startMinute = Math.ceil(window.startMinute / increment) * increment;
        startMinute + input.durationMinutes <= window.endMinute;
        startMinute += increment
      ) {
        const endMinute = startMinute + input.durationMinutes
        const start = vancouverToUtc(date, startMinute)
        const end = vancouverToUtc(date, endMinute)
        const key = `${date}:${startMinute}:${endMinute}`
        if (seen.has(key)) continue
        seen.add(key)
        candidates.push({
          key,
          date,
          startMinute,
          endMinute,
          start,
          end,
          authorization: window.authorization,
        })
        if (candidates.length >= maximum) return candidates
      }
    }
  }
  return candidates
}

function dateOnly(value: Date | string): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10)
}

/** Map Prisma-shaped class records to the pure generator without leaking ORM types. */
export function generateCandidatesFromClassContext(
  context: ClassCandidateContext
): GeneratedClassCandidate[] {
  return generateClassCandidates({
    windowStart: dateOnly(context.windowStart),
    windowEnd: dateOnly(context.windowEnd),
    durationMinutes: context.durationMinutes,
    recurring: context.meetings.map((meeting) => ({
      id: meeting.id,
      dayOfWeek: meeting.dayOfWeek,
      startMinute: meeting.startMinute,
      endMinute: meeting.endMinute,
      effectiveFrom: dateOnly(meeting.effectiveFrom),
      effectiveUntil: meeting.effectiveUntil ? dateOnly(meeting.effectiveUntil) : null,
      active: meeting.activeForScheduling,
      skippedDates: meeting.skips?.map((skip) => dateOnly(skip.date)),
    })),
    exceptions: [
      ...(context.exceptions ?? []).map((item) => ({
        ...item,
        date: dateOnly(item.date),
      })),
      ...(context.schoolClosures ?? []).map((item) => ({
        ...item,
        id: `school:${item.id}`,
        date: dateOnly(item.date),
        kind: 'CLOSED' as const,
      })),
    ],
    explicit: context.explicit,
    maxCandidates: context.maxCandidates,
  })
}
