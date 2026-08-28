import Link from 'next/link'
import { Pencil, EyeOff } from 'lucide-react'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { StatusBadge } from '@/components/admin/status-badge'
import { softDeleteTeacher, reactivateTeacher } from './actions'

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.split(' ')
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-purple-100 text-purple-700',
  'bg-amber-100 text-amber-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
]

function getAvatarColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export default async function TeachersPage() {
  await requireRole('ADMIN')

  const teachers = await prisma.user.findMany({
    where: { role: 'TEACHER' },
    include: { school: true },
    orderBy: { name: 'asc' },
  })

  const active = teachers.filter((t) => !t.deletedAt)
  const deactivated = teachers.filter((t) => t.deletedAt)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Teachers</h1>
          <p className="text-sm text-gray-500">
            Every teacher belongs to a school. Deactivate to hide from rounds without losing history.
          </p>
        </div>
        <Link
          href="/admin/teachers/new"
          className="rounded-lg bg-[#1e2a4a] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a3a5e]"
        >
          + Add teacher
        </Link>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4">
          <p className="text-sm text-gray-500">
            {active.length} active · {deactivated.length} deactivated
          </p>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
              <th className="pb-3 pr-4">Teacher</th>
              <th className="pb-3 pr-4">School</th>
              <th className="pb-3 pr-4">Status</th>
              <th className="pb-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {teachers.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-sm text-gray-400">
                  No teachers yet. Add your first teacher to get started.
                </td>
              </tr>
            )}
            {teachers.map((teacher) => (
              <tr key={teacher.id} className="text-sm">
                <td className="py-4 pr-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex size-9 items-center justify-center rounded-full text-xs font-bold ${getAvatarColor(teacher.id)}`}
                    >
                      {getInitials(teacher.name, teacher.email)}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{teacher.name ?? teacher.email}</p>
                      <p className="text-xs text-gray-400">{teacher.email}</p>
                    </div>
                  </div>
                </td>
                <td className="py-4 pr-4 text-gray-600">
                  {teacher.school?.name ?? <span className="text-gray-300">—</span>}
                </td>
                <td className="py-4 pr-4">
                  <StatusBadge status={teacher.deletedAt ? 'deactivated' : 'active'} />
                </td>
                <td className="py-4">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/teachers/${teacher.id}/edit`}
                      className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                    >
                      <Pencil className="size-4" />
                    </Link>
                    {teacher.deletedAt ? (
                      <form action={reactivateTeacher}>
                        <input type="hidden" name="id" value={teacher.id} />
                        <button
                          type="submit"
                          className="text-xs font-medium text-blue-600 hover:text-blue-800"
                        >
                          Reactivate
                        </button>
                      </form>
                    ) : (
                      <form action={softDeleteTeacher}>
                        <input type="hidden" name="id" value={teacher.id} />
                        <button
                          type="submit"
                          className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                        >
                          <EyeOff className="size-4" />
                        </button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
