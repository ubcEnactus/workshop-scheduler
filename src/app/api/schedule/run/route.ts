import { requireRole } from '@/lib/auth'
import { runSchedule } from '@/lib/scheduling/algorithm'

export async function POST() {
  const denied = await requireRole('ADMIN')
  if (denied) return denied
  const result = runSchedule()
  return Response.json(result)
}
