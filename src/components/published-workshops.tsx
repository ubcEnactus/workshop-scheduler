import { formatInstantRange } from '@/lib/time'
type Item = {
  id: string
  name: string
  school?: string
  start: Date
  end: Date
  status: string
  pas?: string
  reason?: string
  review?: boolean
}
export function PublishedWorkshops({
  items,
  upcomingTitle,
  empty,
}: {
  items: Item[]
  upcomingTitle: string
  empty: string
}) {
  const upcoming = items.filter((w) => w.status === 'PUBLISHED' && w.end.getTime() >= Date.now())
  const history = items.filter((w) => !upcoming.includes(w))
  return (
    <>
      {(
        [
          [upcomingTitle, upcoming],
          ['Workshop history', history],
        ] as const
      ).map(([title, rows]) => (
        <section key={title} className="mt-8">
          <h2 className="text-lg font-medium">{title}</h2>
          {rows.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-600">
              {title === upcomingTitle ? empty : 'No workshop history yet.'}
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {rows.map((w) => (
                <li key={w.id} className="space-y-1 rounded border p-4">
                  <p className="font-medium">{w.name}</p>
                  {w.school && <p>{w.school}</p>}
                  <p>{formatInstantRange(w.start, w.end)}</p>
                  <p>Status: {w.status.toLowerCase()}</p>
                  {w.pas !== undefined && <p>PAs: {w.pas || 'Not assigned'}</p>}
                  {w.reason && <p>Latest change: {w.reason}</p>}
                  {w.review && (
                    <p className="font-medium">
                      This commitment needs admin review. It remains assigned until an admin changes
                      it.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  )
}
