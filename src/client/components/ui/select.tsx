import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/client/lib/utils'

export interface SelectChangeEvent {
  target: {
    value: string
  }
}

interface SelectOption {
  value: string
  label: string
  disabled: boolean
}

export interface SelectProps {
  children: React.ReactNode
  className?: string
  defaultValue?: string
  disabled?: boolean
  name?: string
  onChange?: (event: SelectChangeEvent) => void
  placeholder?: string
  value?: string
}

function getText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }

  if (Array.isArray(node)) {
    return node.map((child) => getText(child)).join('')
  }

  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return getText(node.props.children)
  }

  return ''
}

function getOptions(children: React.ReactNode): SelectOption[] {
  return React.Children.toArray(children).flatMap((child) => {
    if (!React.isValidElement<{ children?: React.ReactNode; disabled?: boolean; value?: string | number }>(child)) {
      return []
    }

    if (child.type === React.Fragment) {
      return getOptions(child.props.children)
    }

    if (child.type !== 'option') {
      return []
    }

    const value = child.props.value == null ? getText(child.props.children) : String(child.props.value)

    return [
      {
        value,
        label: getText(child.props.children),
        disabled: Boolean(child.props.disabled)
      }
    ]
  })
}

export function Select({
  children,
  className,
  defaultValue,
  disabled,
  name,
  onChange,
  placeholder,
  value
}: SelectProps) {
  const options = React.useMemo(() => getOptions(children), [children])
  const fallbackPlaceholder = placeholder ?? options[0]?.label ?? 'Select'

  return (
    <SelectPrimitive.Root
      defaultValue={defaultValue}
      disabled={disabled}
      name={name}
      onValueChange={(nextValue) => onChange?.({ target: { value: nextValue } })}
      value={value}
    >
      <SelectPrimitive.Trigger
        className={cn(
          'relative flex h-8 w-full items-center rounded-[2px] border border-[var(--line)] bg-[var(--panel-soft)] pl-2.5 pr-10 text-left text-[0.88rem] text-[var(--foreground)] outline-none transition data-[placeholder]:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60',
          className
        )}
      >
        <SelectPrimitive.Value placeholder={fallbackPlaceholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown size={15} className="pointer-events-none absolute right-3 text-[var(--muted)]" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="relative z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[2px] border border-[var(--line)] bg-[var(--panel)] text-[var(--foreground)] shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
          collisionPadding={8}
          position="popper"
          sideOffset={4}
        >
          <SelectPrimitive.ScrollUpButton className="absolute inset-x-0 top-0 z-10 flex h-6 items-center justify-center bg-gradient-to-b from-[var(--panel)] via-[rgba(47,51,61,0.94)] to-transparent text-[var(--muted)]">
            <ChevronUp size={14} />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport
            className="overflow-y-auto p-1"
            style={{
              maxHeight: 'min(20rem, var(--radix-select-content-available-height))',
              scrollbarGutter: 'stable'
            }}
          >
            {options.map((option) => (
              <SelectPrimitive.Item
                className="relative flex min-h-7 cursor-default items-center rounded-[2px] py-1 pl-8 pr-8 text-[0.88rem] outline-none transition select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-[var(--accent)] data-[highlighted]:text-[var(--accent-foreground)]"
                disabled={option.disabled}
                key={option.value}
                value={option.value}
              >
                <SelectPrimitive.ItemIndicator className="absolute left-2 inline-flex items-center justify-center">
                  <Check size={14} />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="absolute inset-x-0 bottom-0 z-10 flex h-6 items-center justify-center bg-gradient-to-t from-[var(--panel)] via-[rgba(47,51,61,0.94)] to-transparent text-[var(--muted)]">
            <ChevronDown size={14} />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
