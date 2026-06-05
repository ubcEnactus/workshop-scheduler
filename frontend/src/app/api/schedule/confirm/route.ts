import { requireRole } from '@/lib/auth'
import { confirmSchedule } from '@/lib/scheduling/algorithm'

export async function POST() {
  const denied = await requireRole('ADMIN')
  if (denied) return denied
  const result = confirmSchedule()
  return Response.json(result)
}
