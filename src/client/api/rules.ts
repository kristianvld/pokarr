import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from './http'
import { queryKeys } from './queryKeys'
import type { AppState, RuleInput, QueueIssue, QueueItem } from '@/shared/models'

async function invalidateRuleData(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.appState }),
    queryClient.invalidateQueries({ queryKey: queryKeys.queue }),
    queryClient.invalidateQueries({ queryKey: queryKeys.scanStatus })
  ])
}

export function useQualityOptionsQuery(id: number | null, enabled: boolean) {
  return useQuery<{ qualities: string[] }>({
    queryKey: id === null ? ['instances', 'qualities', 'idle'] : queryKeys.qualityOptions(id),
    queryFn: ({ signal }) =>
      apiRequest<{ qualities: string[] }>(`/api/instances/${id}/qualities`, {
        signal
      }),
    enabled: enabled && id !== null,
    staleTime: 5 * 60_000
  })
}

export function useCreateRuleMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: RuleInput) =>
      apiRequest<{ rule: AppState['rules'][number] }>('/api/rules', {
        method: 'POST',
        body: input
      }),
    onSuccess: async () => {
      await invalidateRuleData(queryClient)
    }
  })
}

export function useUpdateRuleMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: RuleInput }) =>
      apiRequest<{ rule: AppState['rules'][number] }>(`/api/rules/${id}`, {
        method: 'PUT',
        body: input
      }),
    onSuccess: async () => {
      await invalidateRuleData(queryClient)
    }
  })
}

export function useDeleteRuleMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<{ ok: true }>(`/api/rules/${id}`, {
        method: 'DELETE'
      }),
    onSuccess: async () => {
      await invalidateRuleData(queryClient)
    }
  })
}

export function useToggleRuleMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      apiRequest<{ rule: AppState['rules'][number] }>(`/api/rules/${id}/enabled`, {
        method: 'POST',
        body: { enabled }
      }),
    onSuccess: async () => {
      await invalidateRuleData(queryClient)
    }
  })
}

export function useRunRuleMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<{ run: AppState['runs'][number] }>(`/api/rules/${id}/run`, {
        method: 'POST'
      }),
    onSuccess: async () => {
      await invalidateRuleData(queryClient)
    }
  })
}

export function useRefreshRuleMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<{
        state: AppState
        queue: {
          items: QueueItem[]
          issues?: QueueIssue[]
        }
      }>(`/api/rules/${id}/refresh`, {
        method: 'POST'
      }),
    onSuccess: (payload) => {
      queryClient.setQueryData(queryKeys.appState, payload.state)
      queryClient.setQueryData(queryKeys.queue, payload.queue)
      void queryClient.invalidateQueries({ queryKey: queryKeys.scanStatus })
    }
  })
}
