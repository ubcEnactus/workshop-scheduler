import Link from 'next/link'
import { historyPageHref } from './history-pagination-utils'

export function HistoryPagination({
  path,
  query,
  parameter,
  page,
  hasNext,
  noun = 'history',
}: {
  path: string
  query: Record<string, string | undefined>
  parameter: string
  page: number
  hasNext: boolean
  noun?: string
}) {
  if (page === 1 && !hasNext) return null
  return (
    <nav
      aria-label={`${noun} pages`}
      className="mt-4 flex items-center justify-between gap-4 border-t border-slate-100 pt-4 text-sm"
    >
      {page > 1 ? (
        <Link
          className="font-semibold underline"
          href={historyPageHref(path, query, parameter, page - 1)}
        >
          ← Previous {noun}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-slate-500">Page {page}</span>
      {hasNext ? (
        <Link
          className="font-semibold underline"
          href={historyPageHref(path, query, parameter, page + 1)}
        >
          Next {noun} →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  )
}
