import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/client/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-[2px] border text-[0.86rem] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'border-[#5f9fe0] bg-[var(--accent)] px-3 py-1.5 text-[var(--accent-foreground)] hover:bg-[var(--accent-strong)]',
        secondary: 'border-[var(--line)] bg-[var(--panel-soft)] px-3 py-1.5 text-[var(--foreground)] hover:bg-[var(--panel-strong)]',
        ghost: 'border-transparent bg-transparent px-2.5 py-1.5 text-[var(--muted-strong)] hover:border-[var(--line)] hover:bg-[var(--panel-soft)] hover:text-[var(--foreground)]'
      },
      size: {
        default: 'h-8',
        sm: 'h-7 px-2 text-[0.76rem]',
        lg: 'h-9 px-3.5 text-[0.9rem]'
      }
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default'
    }
  }
)

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
