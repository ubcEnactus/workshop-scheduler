import { cn } from '@/lib/utils'

type StatusVariant = 'scheduled' | 'pending' | 'draft' | 'open' | 'closed' | 'confirmed' | 'cancelled'

const variantStyles: Record<StatusVariant, string> = {
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  draft: 'bg-gray-50 text-gray-600 border-gray-200',
  open: 'bg-green-50 text-green-700 border-green-200',
  closed: 'bg-red-50 text-red-600 border-red-200',
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
}

export function StatusBadge({ status }: { status: string }) {
  const variant = status.toLowerCase() as StatusVariant
  const styles = variantStyles[variant] ?? variantStyles.draft

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize',
        styles
      )}
    >
      {status.toLowerCase()}
    </span>
  )
}
