import { requireRole } from '@/lib/auth'
import { getStore } from '@/lib/scheduling/store'

export async function GET() {
  const denied = await requireRole('ADMIN')
  if (denied) return denied
  const { workshops, assignments, pas } = getStore()
  return Response.json({ workshops, assignments, pas })
}
