import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from './http'
import { queryKeys } from './queryKeys'
import type { AppState, QueueIssue, ScanKind, ScanStatusResponse, QueueItem } from '@/shared/models'

async function invalidateScanData(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.appState }),
    queryClient.invalidateQueries({ queryKey: queryKeys.queue }),
    queryClient.invalidateQueries({ queryKey: queryKeys.scanStatus })
  ])
}

export function useScanStatusQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.scanStatus,
    queryFn: ({ signal }) => apiRequest<ScanStatusResponse>('/api/scans/status', { signal }),
    enabled,
    refetchInterval: 3000
  })
}

export function useRunScanMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input?: { instanceId?: number | null; kind?: ScanKind }) =>
      apiRequest<{ queued: number }>('/api/scans/run', {
        method: 'POST',
        body: input ?? { kind: 'full' }
      }),
    onSuccess: async () => {
      await invalidateScanData(queryClient)
    }
  })
}

export function useRebuildQueueMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () =>
      apiRequest<{
        state: AppState
        queue: {
          items: QueueItem[]
          issues?: QueueIssue[]
        }
      }>('/api/queue/rebuild', {
        method: 'POST'
      }),
    onSuccess: async (payload) => {
      queryClient.setQueryData(queryKeys.appState, payload.state)
      queryClient.setQueryData(queryKeys.queue, payload.queue)
      await queryClient.invalidateQueries({ queryKey: queryKeys.scanStatus })
    }
  })
}
