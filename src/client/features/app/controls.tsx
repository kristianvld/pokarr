import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import radarrLogo from '@/client/assets/radarr.svg'
import sonarrLogo from '@/client/assets/sonarr.svg'
import { cn } from '@/client/lib/utils'
import { instanceKindLabel, type InstanceKind } from '@/client/features/app/support'
import type { AppState } from '@/shared/models'

export function ArrTypeIcon({
  kind,
  className = 'h-4 w-4'
}: {
  kind: InstanceKind
  className?: string
}) {
  return <img alt="" className={cn('object-contain', className)} src={kind === 'sonarr' ? sonarrLogo : radarrLogo} />
}

export function InstanceTypeSelect({
  value,
  onChange
}: {
  value: InstanceKind
  onChange: (value: InstanceKind) => void
}) {
  const options: Array<{ value: InstanceKind; description: string }> = [
    { value: 'sonarr', description: 'Series and season searches' },
    { value: 'radarr', description: 'Movie searches only' }
  ]
  const selected = options.find((option) => option.value === value)

  return (
    <SelectPrimitive.Root value={value} onValueChange={(next) => onChange(next as InstanceKind)}>
      <SelectPrimitive.Trigger className="relative flex h-8 w-full items-center rounded-[2px] border border-[var(--line)] bg-[var(--panel-soft)] px-2.5 pr-9 text-left text-[0.88rem] outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]">
        {selected ? (
          <span className="inline-flex min-w-0 items-center gap-2.5">
            <ArrTypeIcon kind={selected.value} className="h-5 w-5 shrink-0" />
            <span className="truncate text-[0.88rem] text-[var(--foreground)]">
              {instanceKindLabel(selected.value)}
            </span>
          </span>
        ) : (
          <span className="text-[0.88rem] text-[var(--muted)]">Select type</span>
        )}
        <SelectPrimitive.Icon asChild>
          <ChevronDown size={16} className="pointer-events-none absolute right-3 text-[var(--muted)]" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[2px] border border-[var(--line)] bg-[var(--panel)] text-[var(--foreground)] shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
          position="popper"
          sideOffset={4}
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                className="relative flex min-h-8 cursor-default items-center gap-2.5 rounded-[2px] py-1.5 pl-9 pr-8 outline-none transition select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-[rgba(105,167,227,0.12)]"
                key={option.value}
                value={option.value}
              >
                <SelectPrimitive.ItemIndicator className="absolute left-2 inline-flex items-center justify-center text-[var(--accent)]">
                  <Check size={14} />
                </SelectPrimitive.ItemIndicator>
                <ArrTypeIcon kind={option.value} className="h-5 w-5 shrink-0" />
                <div className="min-w-0">
                  <SelectPrimitive.ItemText>
                    <span className="block truncate text-[0.88rem]">{instanceKindLabel(option.value)}</span>
                  </SelectPrimitive.ItemText>
                  <span className="block truncate text-[0.76rem] text-[var(--muted)]">{option.description}</span>
                </div>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

export function InstanceConnectionSelect({
  instances,
  value,
  onChange
}: {
  instances: AppState['instances']
  value: number
  onChange: (value: number) => void
}) {
  const selected = instances.find((instance) => instance.id === value)

  return (
    <SelectPrimitive.Root
      disabled={instances.length === 0}
      onValueChange={(next) => onChange(Number(next))}
      value={selected ? String(selected.id) : undefined}
    >
      <SelectPrimitive.Trigger className="relative flex h-8 w-full items-center rounded-[2px] border border-[var(--line)] bg-[var(--panel-soft)] px-2.5 pr-9 text-left text-[0.88rem] outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60">
        {selected ? (
          <span className="inline-flex min-w-0 items-center gap-2.5">
            <ArrTypeIcon kind={selected.kind} className="h-5 w-5 shrink-0" />
            <span className="truncate text-[0.88rem] text-[var(--foreground)]">{selected.name}</span>
          </span>
        ) : (
          <span className="text-[0.88rem] text-[var(--muted)]">
            {instances.length === 0 ? 'No instances available' : 'Select an instance'}
          </span>
        )}
        <SelectPrimitive.Icon asChild>
          <ChevronDown size={16} className="pointer-events-none absolute right-3 text-[var(--muted)]" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[2px] border border-[var(--line)] bg-[var(--panel)] text-[var(--foreground)] shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
          position="popper"
          sideOffset={4}
        >
          <SelectPrimitive.Viewport className="p-1">
            {instances.map((instance) => (
              <SelectPrimitive.Item
                className="relative flex min-h-8 cursor-default items-center gap-2.5 rounded-[2px] py-1.5 pl-9 pr-8 outline-none transition select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-[rgba(105,167,227,0.12)]"
                key={instance.id}
                value={String(instance.id)}
              >
                <SelectPrimitive.ItemIndicator className="absolute left-2 inline-flex items-center justify-center text-[var(--accent)]">
                  <Check size={14} />
                </SelectPrimitive.ItemIndicator>
                <ArrTypeIcon kind={instance.kind} className="h-5 w-5 shrink-0" />
                <div className="min-w-0">
                  <SelectPrimitive.ItemText>
                    <span className="block truncate text-[0.88rem]">{instance.name}</span>
                  </SelectPrimitive.ItemText>
                  <span className="block truncate text-[0.76rem] text-[var(--muted)]">
                    {instanceKindLabel(instance.kind)}
                  </span>
                </div>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
