import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@/client/lib/utils'

export function Switch({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-[var(--line)] bg-[var(--panel)] p-[2px] outline-none transition data-[state=checked]:border-[var(--accent)] data-[state=checked]:bg-[rgba(66,165,245,0.28)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-55',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className="block h-3.5 w-3.5 rounded-full bg-[var(--muted)] shadow-sm transition-transform data-[state=checked]:translate-x-4 data-[state=checked]:bg-[var(--accent)]"
      />
    </SwitchPrimitive.Root>
  )
}
