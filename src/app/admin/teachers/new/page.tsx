import Link from 'next/link'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { createTeacher } from '../actions'

export default async function NewTeacherPage() {
  await requireRole('ADMIN')

  const schools = await prisma.school.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6">
        <Link href="/admin/teachers" className="text-sm text-gray-500 hover:text-gray-700">
          &larr; Back to teachers
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Add teacher</h1>
      </div>

      <form action={createTeacher} className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">Name</label>
          <input
            name="name"
            required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            placeholder="e.g. Sarah Connor"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Email</label>
          <input
            name="email"
            type="email"
            required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            placeholder="e.g. sconnor@lincoln.edu"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">School</label>
          <select
            name="schoolId"
            required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">Select a school…</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded-lg bg-[#1e2a4a] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a3a5e]"
          >
            Add teacher
          </button>
          <Link
            href="/admin/teachers"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
