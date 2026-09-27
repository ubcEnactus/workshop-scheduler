import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import TeacherSchedule from '../../classes/[id]/page'
export default async function TeacherPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requireRole('ADMIN')
  const { id } = await params
  const teacher = await prisma.user.findFirst({
    where: { id, role: 'TEACHER', deletedAt: null, school: { deletedAt: null } },
    select: { classesTaught: { select: { id: true } } },
  })
  const profile = teacher?.classesTaught[0]
  if (!profile) notFound()
  return TeacherSchedule({ params: Promise.resolve({ id: profile.id }), searchParams })
}
