import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requireRole('ADMIN')
  const query = await searchParams
  const params = new URLSearchParams(
    Object.entries(query).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  )
  redirect('/admin/teachers?' + params.toString())
}
