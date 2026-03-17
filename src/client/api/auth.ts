import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from './http'
import { queryKeys } from './queryKeys'
import type { AuthCredentials, AuthSession } from '@/shared/models'

export function useAuthSessionQuery() {
  return useQuery({
    queryKey: queryKeys.authSession,
    queryFn: ({ signal }) => apiRequest<AuthSession>('/api/auth/session', { signal }),
    staleTime: 30_000
  })
}

export function useSetupMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (credentials: AuthCredentials) =>
      apiRequest<AuthSession>('/api/auth/setup', {
        method: 'POST',
        body: credentials
      }),
    onSuccess: async (session) => {
      queryClient.setQueryData(queryKeys.authSession, session)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.appState }),
        queryClient.invalidateQueries({ queryKey: queryKeys.queue }),
        queryClient.invalidateQueries({ queryKey: queryKeys.scanStatus })
      ])
    }
  })
}

export function useLoginMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (credentials: AuthCredentials) =>
      apiRequest<AuthSession>('/api/auth/login', {
        method: 'POST',
        body: credentials
      }),
    onSuccess: async (session) => {
      queryClient.setQueryData(queryKeys.authSession, session)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.appState }),
        queryClient.invalidateQueries({ queryKey: queryKeys.queue }),
        queryClient.invalidateQueries({ queryKey: queryKeys.scanStatus })
      ])
    }
  })
}

export function useLogoutMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () =>
      apiRequest<{ ok: true }>('/api/auth/logout', {
        method: 'POST'
      }),
    onSuccess: async () => {
      queryClient.setQueryData(queryKeys.authSession, {
        setupRequired: false,
        authenticated: false,
        user: null
      } satisfies AuthSession)
      queryClient.removeQueries({ queryKey: queryKeys.appState })
      queryClient.removeQueries({ queryKey: queryKeys.queue })
      queryClient.removeQueries({ queryKey: queryKeys.scanStatus })
    }
  })
}
