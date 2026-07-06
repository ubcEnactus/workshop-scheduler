import { requireRole } from '@/lib/auth'
import ScheduleClient from './ScheduleClient'
import { getProposals } from './actions'

export default async function AdminSchedulePage() {
  await requireRole('ADMIN')
  const data = await getProposals()

  return <ScheduleClient initialData={data} />
}
