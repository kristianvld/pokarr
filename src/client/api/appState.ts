import { useQuery } from '@tanstack/react-query'
import { apiRequest } from './http'
import { queryKeys } from './queryKeys'
import type { AppState, QueueIssue, QueueItem } from '@/shared/models'

export type QueueSnapshotResponse = {
  items: QueueItem[]
  issues?: QueueIssue[]
}

export function useAppStateQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.appState,
    queryFn: ({ signal }) => apiRequest<AppState>('/api/state', { signal }),
    enabled,
    refetchInterval: 5000
  })
}

export function useQueueSnapshotQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.queue,
    queryFn: ({ signal }) => apiRequest<QueueSnapshotResponse>('/api/queue', { signal }),
    enabled,
    refetchInterval: 5000
  })
}
