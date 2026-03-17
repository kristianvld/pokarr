import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject
} from 'react'
import { createPortal } from 'react-dom'
import {
  Bell,
  CircleHelp,
  Plus,
  X,
  type LucideIcon
} from 'lucide-react'
import { Button } from '@/client/components/ui/button'
import { Card, CardContent } from '@/client/components/ui/card'
import { Select } from '@/client/components/ui/select'
import { Switch } from '@/client/components/ui/switch'
import { cn } from '@/client/lib/utils'
import { listPageSizeOptions, type ListPageSize } from '@/client/paging'
import type { NoticeItem, ToolbarAction } from '@/client/features/app/support'
export function ModalShell({
  title,
  open,
  onClose,
  children,
  footer
}: {
  title: string
  open: boolean
  onClose: () => void
  children: ReactNode
  footer: ReactNode
}) {
  if (!open) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(0,0,0,0.72)] p-4 md:p-7"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
      role="presentation"
    >
      <div
        aria-label={title}
        aria-modal="true"
        className="flex max-h-full w-full max-w-[1020px] flex-col overflow-hidden border border-[var(--line)] bg-[var(--panel)] shadow-[0_22px_64px_rgba(0,0,0,0.55)]"
        role="dialog"
      >
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
          <h2 className="text-[1.12rem] font-semibold text-[var(--foreground)]">{title}</h2>
          <button
            aria-label="Close dialog"
            className="rounded-[2px] p-1 text-[var(--muted)] transition hover:bg-[rgba(255,255,255,0.06)] hover:text-white"
            type="button"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
        <div className="border-t border-[var(--line)] px-5 py-4">{footer}</div>
      </div>
    </div>
  )
}

export function ModalSection({
  title,
  description,
  columnsClassName = 'md:grid-cols-2',
  children
}: {
  title?: string
  description?: string
  columnsClassName?: string
  children: ReactNode
}) {
  return (
    <section className="space-y-3 border-b border-[var(--line)] pb-4 last:border-b-0 last:pb-0">
      {title || description ? (
        <div className="space-y-1">
          {title ? <h3 className="text-[0.9rem] font-semibold text-[var(--foreground)]">{title}</h3> : null}
          {description ? <p className="text-[0.78rem] leading-5 text-[var(--muted)]">{description}</p> : null}
        </div>
      ) : null}
      <div className={cn('grid gap-3', columnsClassName)}>{children}</div>
    </section>
  )
}

export function FieldBlock({
  label,
  hint,
  help,
  disabled = false,
  className,
  children
}: {
  label: string
  hint?: string
  help?: string
  disabled?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('space-y-1.5', disabled ? 'opacity-60' : '', className)}>
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5">
          <p className={cn('text-[0.84rem] font-semibold text-[var(--foreground)]', disabled ? 'text-[var(--foreground-soft)]' : '')}>{label}</p>
          {help ? <InfoHint content={help} /> : null}
        </div>
        {hint ? <p className="text-[0.74rem] leading-5 text-[var(--muted)]">{hint}</p> : null}
      </div>
      {children}
    </div>
  )
}

export function InlineSwitchField({
  label,
  help,
  checked,
  onCheckedChange,
  disabled = false,
  className
}: {
  label: string
  help?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'inline-flex h-8 items-center gap-2',
        disabled ? 'opacity-60' : '',
        className
      )}
    >
      <div className="flex items-center gap-1.5">
        <p className="text-[0.88rem] font-semibold text-[var(--foreground)]">{label}</p>
        {help ? <InfoHint content={help} /> : null}
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  )
}

export function InfoHint({ content }: { content: string }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number; ready: boolean }>({
    top: 0,
    left: 0,
    ready: false
  })
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const tooltipRef = useRef<HTMLSpanElement | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setPosition((current) => ({ ...current, ready: false }))
      return
    }

    const updatePosition = () => {
      const trigger = triggerRef.current
      const tooltip = tooltipRef.current
      if (!trigger || !tooltip) {
        return
      }

      const triggerRect = trigger.getBoundingClientRect()
      const tooltipRect = tooltip.getBoundingClientRect()
      const viewportPadding = 8
      let left = triggerRect.left
      let top = triggerRect.bottom + 6

      if (left + tooltipRect.width > window.innerWidth - viewportPadding) {
        left = Math.max(viewportPadding, window.innerWidth - tooltipRect.width - viewportPadding)
      }

      if (top + tooltipRect.height > window.innerHeight - viewportPadding) {
        top = Math.max(viewportPadding, triggerRect.top - tooltipRect.height - 6)
      }

      setPosition({
        top,
        left,
        ready: true
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, content])

  return (
    <span className="inline-flex">
      <button
        type="button"
        aria-label={content}
        ref={triggerRef}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[var(--muted)] transition hover:text-white focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        onBlur={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <CircleHelp size={13} />
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <span
              ref={tooltipRef}
              className="pointer-events-none fixed z-[80] w-56 rounded-[2px] border border-[var(--line)] bg-[var(--panel)] px-2 py-1.5 text-[0.74rem] leading-5 text-[var(--foreground-soft)] shadow-[0_10px_24px_rgba(0,0,0,0.4)]"
              style={{
                left: position.left,
                top: position.top,
                visibility: position.ready ? 'visible' : 'hidden'
              }}
            >
              {content}
            </span>,
            document.body
          )
        : null}
    </span>
  )
}

export function FieldFeedback({
  tone,
  children
}: {
  tone: 'success' | 'danger'
  children: ReactNode
}) {
  return (
    <p className={cn('text-[0.74rem] leading-5', tone === 'success' ? 'text-[#74d99f]' : 'text-[var(--danger)]')}>
      {children}
    </p>
  )
}

export function SettingsGroupCard({
  title,
  subtitle,
  children
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="space-y-1 border-b border-[var(--line)] pb-3">
          <h3 className="text-[0.9rem] font-semibold text-[var(--foreground)]">{title}</h3>
          <p className="text-[0.8rem] leading-5 text-[var(--muted)]">{subtitle}</p>
        </div>
        <div className="space-y-1.5">{children}</div>
      </CardContent>
    </Card>
  )
}

export function SettingsToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled = false
}: {
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 border-b border-[var(--line)] py-2.5 last:border-b-0 last:pb-0',
        disabled ? 'opacity-60' : ''
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <p className="text-[0.86rem] font-semibold text-[var(--foreground)]">{label}</p>
        <p className="text-[0.78rem] leading-5 text-[var(--muted)]">{description}</p>
      </div>
      <div className="pt-0.5">
        <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
      </div>
    </div>
  )
}

export function CardGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>
}

export function SelectableCard({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <div
      className="h-full border border-[var(--line)] bg-[var(--panel)] p-4 text-left transition hover:border-[var(--line-strong)] hover:bg-[var(--panel-strong)]"
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick()
        }
      }}
      role="button"
      tabIndex={0}
    >
      {children}
    </div>
  )
}

export function AddTile({
  label,
  onClick,
  disabled = false
}: {
  label: string
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      className={`flex min-h-[232px] items-center justify-center border border-[var(--line)] bg-[var(--panel)] transition ${
        disabled
          ? 'cursor-not-allowed opacity-55'
          : 'hover:border-[var(--line-strong)] hover:bg-[var(--panel-strong)]'
      }`}
      disabled={disabled}
      onClick={onClick}
    >
      <div className="flex flex-col items-center gap-3 text-[var(--muted)]">
        <div className="flex h-16 w-16 items-center justify-center rounded-[2px] border border-[var(--line-strong)]">
          <Plus size={28} />
        </div>
        <span className="text-[0.95rem] font-semibold text-[var(--foreground-soft)]">{label}</span>
      </div>
    </button>
  )
}

export function EmptyCardGrid({
  title,
  body,
  actionLabel,
  onAction,
  disabled = false
}: {
  title: string
  body: string
  actionLabel: string
  onAction?: () => void
  disabled?: boolean
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card className="md:col-span-2 xl:col-span-2">
        <CardContent className="space-y-2">
          <p className="text-[0.96rem] font-semibold text-[var(--foreground)]">{title}</p>
          <p className="text-[0.84rem] text-[var(--muted)]">{body}</p>
        </CardContent>
      </Card>
      <AddTile disabled={disabled} label={actionLabel} onClick={onAction} />
    </div>
  )
}

export function CardMetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="text-right text-[var(--foreground)]">{value}</span>
    </div>
  )
}

export function MutedSummary({ children }: { children: ReactNode }) {
  return <p className="text-[0.84rem] text-[var(--muted)]">{children}</p>
}

export function PageSizeControl({
  value,
  onChange
}: {
  value: ListPageSize
  onChange: (next: ListPageSize) => void
}) {
  return (
    <div className="flex items-center gap-2 text-[0.8rem] text-[var(--foreground-soft)]">
      <span className="whitespace-nowrap text-[var(--muted)]">Page size</span>
      <Select className="w-[92px]" value={String(value)} onChange={(event) => onChange(Number(event.target.value) as ListPageSize)}>
        {listPageSizeOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Select>
    </div>
  )
}

export function ListResultsSummary({
  shownCount,
  matchingCount,
  totalCount
}: {
  shownCount: number
  matchingCount: number
  totalCount: number
}) {
  if (matchingCount === 0 && totalCount === 0) {
    return null
  }

  return (
    <div className="mb-3 text-[0.8rem] text-[var(--muted)]">
      {matchingCount === totalCount
        ? `Showing ${shownCount} of ${matchingCount}.`
        : `Showing ${shownCount} of ${matchingCount} matching items (${totalCount} total).`}
    </div>
  )
}

export function ProgressiveListFooter({
  canLoadMore,
  onLoadMore,
  sentinelRef,
  shownCount,
  totalCount
}: {
  canLoadMore: boolean
  onLoadMore: () => void
  sentinelRef: RefObject<HTMLDivElement | null>
  shownCount: number
  totalCount: number
}) {
  if (totalCount === 0) {
    return null
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[0.78rem] text-[var(--muted)]">
        <span>
          {canLoadMore ? `Loaded ${shownCount} of ${totalCount}. Scroll or use the button to continue.` : `All ${totalCount} items are loaded.`}
        </span>
        {canLoadMore ? (
          <Button size="sm" variant="secondary" onClick={onLoadMore}>
            Load more
          </Button>
        ) : null}
      </div>
      <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
    </div>
  )
}

export function BrandMark() {
  return (
    <div className="flex items-center gap-2">
      <BrandIcon />
      <div className="text-[1.95rem] leading-none tracking-tight" style={{ fontFamily: 'var(--font-brand)' }}>
        <span className="text-[var(--accent-warm)]">POK</span>
        <span className="text-[var(--accent-cool)]">ARR</span>
      </div>
    </div>
  )
}

export function BrandIcon() {
  return (
    <img
      alt=""
      aria-hidden="true"
      className="h-10 w-10 shrink-0"
      src="/favicon.svg"
    />
  )
}

export function ToolbarActionButton({ action, separated }: { action: ToolbarAction; separated: boolean }) {
  const Icon = action.icon

  return (
    <button
      className={`flex min-w-[76px] flex-col items-center justify-center gap-1 px-3 py-2 text-[0.84rem] text-[var(--foreground-soft)] transition hover:bg-[rgba(255,255,255,0.04)] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--foreground-soft)] ${
        separated ? 'border-r border-[rgba(255,255,255,0.12)]' : ''
      } ${action.tone === 'primary' ? 'bg-[rgba(105,167,227,0.08)] text-white' : ''}`}
      disabled={action.disabled}
      onClick={action.onClick}
    >
      <Icon size={18} className={action.spinning ? 'animate-spin' : undefined} />
      <span className="leading-none">{action.label}</span>
    </button>
  )
}

export function NavCount({ value }: { value: number }) {
  return (
    <span className="inline-flex min-w-5 items-center justify-center rounded-[2px] bg-[var(--accent)] px-1.5 py-px text-[0.68rem] font-bold text-white">
      {value}
    </span>
  )
}

export function SidebarNoticeDock({ notices }: { notices: NoticeItem[] }) {
  if (notices.length === 0) {
    return null
  }

  return (
    <div className="space-y-2 border-t border-black/25 bg-[rgba(0,0,0,0.16)] p-3">
      {notices.map((notice) => (
        <InlineNotice key={notice.id} notice={notice} compact />
      ))}
    </div>
  )
}

export function InlineNotice({ notice, compact = false }: { notice: NoticeItem; compact?: boolean }) {
  const accentClass =
    notice.tone === 'success'
      ? 'border-[rgba(126,211,107,0.32)] bg-[rgba(126,211,107,0.08)]'
      : 'border-[rgba(234,107,103,0.32)] bg-[rgba(234,107,103,0.08)]'
  const railClass = notice.tone === 'success' ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'
  const iconClass = notice.tone === 'success' ? 'text-[var(--success)]' : 'text-[var(--danger)]'

  return (
    <div
      aria-live={notice.tone === 'danger' ? 'assertive' : 'polite'}
      className={`pointer-events-auto relative overflow-hidden border ${accentClass}`}
      role={notice.tone === 'danger' ? 'alert' : 'status'}
    >
      <span className={`absolute inset-y-0 left-0 w-[3px] ${railClass}`} />
      <div className={`flex items-start gap-2.5 pl-4 pr-2 ${compact ? 'py-2' : 'py-2.5'}`}>
        <Bell size={15} className={`mt-0.5 shrink-0 ${iconClass}`} />
        <p className={`min-w-0 flex-1 text-[var(--foreground-soft)] ${compact ? 'text-[0.82rem]' : 'text-[0.86rem]'}`}>
          {notice.message}
        </p>
        <button
          className="shrink-0 rounded-[2px] p-1 text-[var(--muted)] transition hover:bg-[rgba(255,255,255,0.06)] hover:text-white"
          onClick={notice.onDismiss}
        >
          <X size={13} />
        </button>
      </div>
    </div>
  )
}

export function LoadingShell() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="h-32 animate-pulse border border-[var(--line)] bg-[var(--panel)]" />
      ))}
    </div>
  )
}

export function ContentBlock({
  title,
  subtitle,
  action,
  children
}: {
  title: string
  subtitle: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section>
      <div className="mb-3 flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-[0.96rem] font-semibold text-[var(--foreground)]">{title}</h2>
          <p className="mt-1 text-[0.85rem] text-[var(--muted)]">{subtitle}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function MetricPanel({
  label,
  value,
  note,
  icon: Icon
}: {
  label: string
  value: string
  note: string
  icon: LucideIcon
}) {
  return (
    <div className="border border-[var(--line)] bg-[var(--panel)]">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2">
        <span className="text-[0.86rem] font-semibold text-[var(--foreground-soft)]">{label}</span>
        <Icon size={18} className="text-[var(--accent)]" />
      </div>
      <div className="px-3 py-3">
        <p className="text-[1.6rem] font-light leading-none text-white">{value}</p>
        <p className="mt-1.5 text-[0.85rem] text-[var(--muted)]">{note}</p>
      </div>
    </div>
  )
}

export function TableFrame({
  columns,
  rows,
  emptyTitle,
  emptyBody
}: {
  columns: Array<{
    key: string
    content: ReactNode
  }>
  rows: Array<{
    key: string
    cells: Array<{
      key: string
      content: ReactNode
    }>
  }>
  emptyTitle: string
  emptyBody: string
}) {
  return (
    <div className="overflow-hidden border border-[var(--line)] bg-[var(--panel)]">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-[0.88rem]">
          <thead className="bg-[rgba(255,255,255,0.02)] text-[var(--foreground-soft)]">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="border-b border-[var(--line)] px-3 py-2 font-semibold">
                  {column.content}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length > 0
              ? rows.map((row) => (
                  <tr key={row.key} className="align-top text-[var(--foreground)]">
                    {row.cells.map((cell) => (
                      <td key={cell.key} className="border-b border-[rgba(255,255,255,0.08)] px-3 py-2">
                        {cell.content}
                      </td>
                    ))}
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && emptyTitle ? (
        <div className="px-3 py-5">
          <p className="text-[0.92rem] font-semibold text-[var(--foreground)]">{emptyTitle}</p>
          <p className="mt-1.5 text-[0.84rem] text-[var(--muted)]">{emptyBody}</p>
        </div>
      ) : null}
    </div>
  )
}

export function FormRow({
  label,
  hint,
  children
}: {
  label: string
  hint: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-2 border-b border-[var(--line)] pb-3 last:border-b-0 last:pb-0 md:grid-cols-[152px_1fr] md:items-start">
      <div className="pt-1">
        <p className="text-[0.88rem] font-semibold text-[var(--foreground)]">{label}</p>
        <p className="mt-1 text-[0.74rem] text-[var(--muted)]">{hint}</p>
      </div>
      <div>{children}</div>
    </div>
  )
}

export function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-2 border-b border-[var(--line)] py-1.5 last:border-b-0 md:grid-cols-[160px_1fr]">
      <span className="font-semibold text-[var(--foreground-soft)]">{label}</span>
      <span className="text-[var(--foreground)]">{value}</span>
    </div>
  )
}
