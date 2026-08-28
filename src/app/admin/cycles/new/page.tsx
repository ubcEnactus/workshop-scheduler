import Link from 'next/link'

import { requireRole } from '@/lib/auth'
import { createCycle } from '../actions'

export default async function NewCyclePage() {
  await requireRole('ADMIN')

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6">
        <Link href="/admin/cycles" className="text-sm text-gray-500 hover:text-gray-700">
          &larr; Back to rounds
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">New round</h1>
        <p className="mt-1 text-sm text-gray-500">
          Rounds start as drafts. When you open one, a workshop is created for every active class.
        </p>
      </div>

      <form action={createCycle} className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">Round name</label>
          <input
            name="name"
            required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            placeholder="e.g. Fall 2026 Round"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Start date</label>
            <input
              name="startDate"
              type="date"
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">End date</label>
            <input
              name="endDate"
              type="date"
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded-lg bg-[#1e2a4a] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a3a5e]"
          >
            Create round
          </button>
          <Link
            href="/admin/cycles"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
