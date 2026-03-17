import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'
import { cn } from '@/client/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-[2px] border px-1.5 py-px text-[0.66rem] font-semibold uppercase tracking-[0.08em]',
  {
    variants: {
      variant: {
        neutral: 'border-[var(--line)] bg-[var(--panel-soft)] text-[var(--foreground-soft)]',
        success: 'border-[rgba(126,211,107,0.35)] bg-[rgba(126,211,107,0.12)] text-[var(--success)]',
        warning: 'border-[rgba(243,194,90,0.35)] bg-[rgba(243,194,90,0.12)] text-[var(--warning)]',
        danger: 'border-[rgba(234,107,103,0.35)] bg-[rgba(234,107,103,0.12)] text-[var(--danger)]'
      }
    },
    defaultVariants: {
      variant: 'neutral'
    }
  }
)

type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
