import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from './http'
import { queryKeys } from './queryKeys'
import type { SettingsUpdate } from '@/shared/models'

export function useNotificationValidationQuery(url: string | null, enabled: boolean) {
  const trimmed = url?.trim() ?? ''

  return useQuery({
    queryKey: queryKeys.notificationValidation(trimmed),
    queryFn: ({ signal }) =>
      apiRequest<{ valid: true }>('/api/settings/notifications/validate', {
        method: 'POST',
        body: { url: trimmed },
        signal
      }),
    enabled: enabled && trimmed.length > 0,
    staleTime: 0,
    gcTime: 0
  })
}

export function useSaveSettingsMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: SettingsUpdate) =>
      apiRequest<{ settings: SettingsUpdate }>('/api/settings', {
        method: 'POST',
        body: input
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.appState }),
        queryClient.invalidateQueries({ queryKey: queryKeys.queue }),
        queryClient.invalidateQueries({ queryKey: queryKeys.scanStatus })
      ])
    }
  })
}

export function useNotificationTestMutation() {
  return useMutation({
    mutationFn: (url: string | null) =>
      apiRequest<{ ok: true }>('/api/settings/notifications/test', {
        method: 'POST',
        body: { url }
      })
  })
}
