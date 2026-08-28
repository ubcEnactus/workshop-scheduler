import Link from 'next/link'
import { Pencil, EyeOff } from 'lucide-react'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { StatusBadge } from '@/components/admin/status-badge'
import { softDeleteSchool, reactivateSchool } from './actions'

export default async function SchoolsPage() {
  await requireRole('ADMIN')

  const schools = await prisma.school.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { teachers: true, classSections: true } },
    },
  })

  const active = schools.filter((s) => !s.deletedAt)
  const deactivated = schools.filter((s) => s.deletedAt)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schools</h1>
          <p className="text-sm text-gray-500">
            Manage partner schools. Deactivating hides a school without deleting its history.
          </p>
        </div>
        <Link
          href="/admin/schools/new"
          className="rounded-lg bg-[#1e2a4a] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a3a5e]"
        >
          + Add school
        </Link>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {active.length} active · {deactivated.length} deactivated
          </p>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
              <th className="pb-3 pr-4">School</th>
              <th className="pb-3 pr-4">District</th>
              <th className="pb-3 pr-4">Teachers</th>
              <th className="pb-3 pr-4">Classes</th>
              <th className="pb-3 pr-4">Status</th>
              <th className="pb-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {schools.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-gray-400">
                  No schools yet. Add your first school to get started.
                </td>
              </tr>
            )}
            {schools.map((school) => (
              <tr key={school.id} className="text-sm">
                <td className="py-4 pr-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-red-50 text-red-500">
                      <svg className="size-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{school.name}</p>
                      <p className="text-xs text-gray-400">S-{school.id.slice(-3)}</p>
                    </div>
                  </div>
                </td>
                <td className="py-4 pr-4 text-gray-600">{school.district}</td>
                <td className="py-4 pr-4 text-gray-600">{school._count.teachers}</td>
                <td className="py-4 pr-4 text-gray-600">{school._count.classSections}</td>
                <td className="py-4 pr-4">
                  <StatusBadge status={school.deletedAt ? 'deactivated' : 'active'} />
                </td>
                <td className="py-4">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/schools/${school.id}/edit`}
                      className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                    >
                      <Pencil className="size-4" />
                    </Link>
                    {school.deletedAt ? (
                      <form action={reactivateSchool}>
                        <input type="hidden" name="id" value={school.id} />
                        <button
                          type="submit"
                          className="text-xs font-medium text-blue-600 hover:text-blue-800"
                        >
                          Reactivate
                        </button>
                      </form>
                    ) : (
                      <form action={softDeleteSchool}>
                        <input type="hidden" name="id" value={school.id} />
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
