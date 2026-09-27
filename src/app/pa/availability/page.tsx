import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { PageHeader } from '@/components/ui/page-header'
import { PAScheduleEditor } from '@/components/pa-schedule-editor'
export default async function PAAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; effectiveFrom?: string; month?: string }>
}) {
  const user = await requireRole('PA')
  return (
    <main className="page-content">
      <PageHeader
        eyebrow="Program assistant"
        title="Weekly availability"
        actions={
          <Link href="/pa" className="text-sm underline">
            Back to dashboard
          </Link>
        }
      />
      <PAScheduleEditor userId={user.id} basePath="/pa/availability" query={await searchParams} />
    </main>
  )
}
