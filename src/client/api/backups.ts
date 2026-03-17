import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from './http'
import { queryKeys } from './queryKeys'
import type { AppState } from '@/shared/models'

async function invalidateBackupData(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.appState }),
    queryClient.invalidateQueries({ queryKey: queryKeys.queue }),
    queryClient.invalidateQueries({ queryKey: queryKeys.scanStatus })
  ])
}

export function useCreateBackupMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () =>
      apiRequest<{ backup: AppState['backups'][number] }>('/api/backups', {
        method: 'POST'
      }),
    onSuccess: async () => {
      await invalidateBackupData(queryClient)
    }
  })
}

export function useRestoreBackupMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<{
        backup: AppState['backups'][number]
        state: AppState
      }>(`/api/backups/${id}/restore`, {
        method: 'POST'
      }),
    onSuccess: async (payload) => {
      queryClient.setQueryData(queryKeys.appState, payload.state)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.queue }),
        queryClient.invalidateQueries({ queryKey: queryKeys.scanStatus })
      ])
    }
  })
}
