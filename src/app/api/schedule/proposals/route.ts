import { requireRole } from '@/lib/auth'
import { getStore } from '@/lib/scheduling/store'

export async function GET() {
  await requireRole('ADMIN')
  const { workshops, assignments, pas } = getStore()
  return Response.json({ workshops, assignments, pas })
}
