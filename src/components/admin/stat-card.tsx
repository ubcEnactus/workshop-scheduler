import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: number | string
  subtitle?: string
  icon: React.ReactNode
  color: 'red' | 'amber' | 'green' | 'blue'
}

const colorMap = {
  red: 'bg-red-50 text-red-600 border-red-100',
  amber: 'bg-amber-50 text-amber-600 border-amber-100',
  green: 'bg-green-50 text-green-600 border-green-100',
  blue: 'bg-blue-50 text-blue-600 border-blue-100',
} as const

export function StatCard({ label, value, subtitle, icon, color }: StatCardProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-xl border px-5 py-4',
        colorMap[color]
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-lg bg-current/10">
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
        {subtitle && <p className="text-xs opacity-60">{subtitle}</p>}
      </div>
    </div>
  )
}
