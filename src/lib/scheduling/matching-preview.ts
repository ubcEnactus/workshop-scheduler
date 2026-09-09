import { createHash } from 'node:crypto'
import type { ScheduleSnapshot } from './eligibility'
export function scheduleHash(snapshot: ScheduleSnapshot) {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
}
