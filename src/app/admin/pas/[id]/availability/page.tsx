import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { PageHeader } from '@/components/ui/page-header'
import { PAScheduleEditor } from '@/components/pa-schedule-editor'
export default async function AdminPASchedule({params,searchParams}: {
  params: Promise<{id:string}>
  searchParams: Promise<{saved?:string;error?:string;effectiveFrom?:string}>
}) {
  await requireRole('ADMIN')
  const {id}=await params
  const pa=await prisma.user.findFirst({where:{id,role:'PA',deletedAt:null}})
  if (!pa) notFound()
  return <main className="page-content">
    <PageHeader eyebrow="PA availability" title={pa.name ?? pa.email} description={pa.email} actions={<Link href="/admin/pas" className="text-sm underline">Back to PAs</Link>} />
    <PAScheduleEditor userId={pa.id} basePath={`/admin/pas/${pa.id}/availability`} admin query={await searchParams} />
  </main>
}
