export const listPageSizeOptions = [20, 50, 100, 200] as const
export type ListPageSize = (typeof listPageSizeOptions)[number]

export const defaultListPageSize: ListPageSize = 20

export function isListPageSize(value: unknown): value is ListPageSize {
  return typeof value === 'number' && listPageSizeOptions.includes(value as ListPageSize)
}

export function getInitialVisibleCount(total: number, pageSize: ListPageSize) {
  return Math.min(Math.max(total, 0), pageSize)
}

export function getNextVisibleCount(current: number, total: number, pageSize: ListPageSize) {
  if (total <= 0) {
    return 0
  }

  const baseline = Math.max(pageSize, current)
  return Math.min(total, baseline + pageSize)
}
