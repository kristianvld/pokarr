import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from './http'
import { queryKeys } from './queryKeys'
import type { InstanceInput } from '@/shared/models'

async function invalidateInstanceData(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.appState }),
    queryClient.invalidateQueries({ queryKey: queryKeys.queue }),
    queryClient.invalidateQueries({ queryKey: queryKeys.scanStatus })
  ])
}

export function useInstanceConnectionQuery(id: number | null, enabled: boolean) {
  return useQuery({
    queryKey: id === null ? ['instances', 'connection', 'idle'] : queryKeys.instanceConnection(id),
    queryFn: ({ signal }) =>
      apiRequest<{ instance: InstanceInput & { id: number } }>(`/api/instances/${id}`, {
        signal
      }),
    enabled: enabled && id !== null
  })
}

export function useCreateInstanceMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: InstanceInput) =>
      apiRequest<{ instance: InstanceInput & { id: number } }>('/api/instances', {
        method: 'POST',
        body: input
      }),
    onSuccess: async () => {
      await invalidateInstanceData(queryClient)
    }
  })
}

export function useUpdateInstanceMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: InstanceInput }) =>
      apiRequest<{ instance: InstanceInput & { id: number } }>(`/api/instances/${id}`, {
        method: 'PUT',
        body: input
      }),
    onSuccess: async (_, variables) => {
      await invalidateInstanceData(queryClient)
      queryClient.invalidateQueries({ queryKey: queryKeys.instanceConnection(variables.id) })
    }
  })
}

export function useDeleteInstanceMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<{ ok: true }>(`/api/instances/${id}`, {
        method: 'DELETE'
      }),
    onSuccess: async (_, id) => {
      await invalidateInstanceData(queryClient)
      queryClient.removeQueries({ queryKey: queryKeys.instanceConnection(id) })
      queryClient.removeQueries({ queryKey: queryKeys.qualityOptions(id) })
    }
  })
}

export function useTestInstanceMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: InstanceInput & { persistId?: number }) =>
      apiRequest<{ ok: true }>('/api/instances/test', {
        method: 'POST',
        body: input
      }),
    onSuccess: async (_, variables) => {
      if (variables.persistId) {
        await invalidateInstanceData(queryClient)
      }
    }
  })
}

export function useValidateInstanceMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<{ ok: true }>(`/api/instances/${id}/validate`, {
        method: 'POST'
      }),
    onSettled: async (_, __, id) => {
      await invalidateInstanceData(queryClient)
      queryClient.invalidateQueries({ queryKey: queryKeys.instanceConnection(id) })
    }
  })
}
