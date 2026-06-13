import { requireRole } from '@/lib/auth'
import { runSchedule } from '@/lib/scheduling/algorithm'

export async function POST() {
  await requireRole('ADMIN')
  const result = runSchedule()
  return Response.json(result)
}
