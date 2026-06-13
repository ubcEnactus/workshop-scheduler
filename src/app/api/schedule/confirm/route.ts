import { requireRole } from '@/lib/auth'
import { confirmSchedule } from '@/lib/scheduling/algorithm'

export async function POST() {
  await requireRole('ADMIN')
  const result = confirmSchedule()
  return Response.json(result)
}
