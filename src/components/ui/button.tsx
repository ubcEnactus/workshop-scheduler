import type { ButtonHTMLAttributes } from 'react'
export function buttonClasses({
  variant = 'primary',
  size = 'md',
}: { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; size?: 'sm' | 'md' } = {}) {
  const colors = {
    primary: 'bg-amber-400 text-slate-950 hover:bg-amber-500 border-amber-400',
    secondary: 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200',
    danger: 'bg-red-50 text-red-700 hover:bg-red-100 border-red-200',
    ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 border-transparent',
  }
  return (
    'inline-flex items-center justify-center gap-2 rounded-lg border font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 ' +
    colors[variant] +
    ' ' +
    (size === 'sm' ? 'min-h-9 px-3 py-1.5 text-xs' : 'min-h-10 px-4 py-2.5 text-sm')
  )
}
export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md'
}) {
  return <button className={buttonClasses({ variant, size }) + ' ' + className} {...props} />
}
