import Link from 'next/link'

import { requireRole } from '@/lib/auth'
import { COMMUNITIES } from '@/lib/scheduling/commute'
import { createSchool } from '../actions'

export default async function NewSchoolPage() {
  await requireRole('ADMIN')

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6">
        <Link href="/admin/schools" className="text-sm text-gray-500 hover:text-gray-700">
          &larr; Back to schools
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Add school</h1>
      </div>

      <form action={createSchool} className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">Name</label>
          <input
            name="name"
            required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            placeholder="e.g. Lincoln High School"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">District</label>
          <input
            name="district"
            required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            placeholder="e.g. East District"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Community</label>
          <select
            name="community"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">Select community (optional)</option>
            {COMMUNITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded-lg bg-[#1e2a4a] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a3a5e]"
          >
            Add school
          </button>
          <Link
            href="/admin/schools"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
