import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AuthScreen } from '@/client/AuthScreen'
import { useAuthSessionQuery, useLoginMutation, useLogoutMutation, useSetupMutation } from '@/client/api/auth'
import { authRequiredEventName } from '@/client/api/http'
import { queryKeys } from '@/client/api/queryKeys'
import { AuthenticatedApp } from '@/client/features/app/AuthenticatedApp'
import { LoadingShell } from '@/client/features/app/shared'
import { Button } from '@/client/components/ui/button'
import { Card, CardContent } from '@/client/components/ui/card'

export default function App() {
  const queryClient = useQueryClient()
  const authSessionQuery = useAuthSessionQuery()
  const setupMutation = useSetupMutation()
  const loginMutation = useLoginMutation()
  const logoutMutation = useLogoutMutation()

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleAuthRequired = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.authSession })
    }

    window.addEventListener(authRequiredEventName, handleAuthRequired)
    return () => window.removeEventListener(authRequiredEventName, handleAuthRequired)
  }, [queryClient])

  if (authSessionQuery.isPending) {
    return (
      <div className="min-h-screen bg-[var(--background)] px-4 py-6 text-[var(--foreground)]">
        <LoadingShell />
      </div>
    )
  }

  if (authSessionQuery.isError || !authSessionQuery.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-8 text-[var(--foreground)]">
        <Card className="w-full max-w-[420px]">
          <CardContent className="space-y-4 p-6">
            <div>
              <h1 className="text-[1.2rem] font-semibold text-white">Failed to load authentication state</h1>
              <p className="mt-2 text-[0.9rem] text-[var(--foreground-soft)]">
                {authSessionQuery.error instanceof Error
                  ? authSessionQuery.error.message
                  : 'The server did not return a valid auth response.'}
              </p>
            </div>
            <Button onClick={() => void authSessionQuery.refetch()}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (authSessionQuery.data.setupRequired) {
    return (
      <AuthScreen
        mode="setup"
        error={setupMutation.error instanceof Error ? setupMutation.error.message : null}
        pending={setupMutation.isPending}
        onSubmit={async (credentials) => {
          await setupMutation.mutateAsync(credentials)
        }}
      />
    )
  }

  if (!authSessionQuery.data.authenticated) {
    return (
      <AuthScreen
        mode="login"
        error={loginMutation.error instanceof Error ? loginMutation.error.message : null}
        pending={loginMutation.isPending}
        onSubmit={async (credentials) => {
          await loginMutation.mutateAsync(credentials)
        }}
      />
    )
  }

  return (
    <AuthenticatedApp
      authSession={authSessionQuery.data}
      loggingOut={logoutMutation.isPending}
      onLogout={async () => {
        await logoutMutation.mutateAsync()
      }}
    />
  )
}
