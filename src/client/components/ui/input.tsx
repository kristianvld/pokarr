import type { InputHTMLAttributes } from 'react'
import { cn } from '@/client/lib/utils'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-8 w-full appearance-none rounded-[2px] border border-[var(--line)] bg-[var(--panel-soft)] px-2.5 text-[0.88rem] text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]',
        className
      )}
      {...props}
    />
  )
}
