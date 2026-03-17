import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import type { ReactNode } from 'react'
import { isDevelopmentClientEnv, type ClientImportMetaEnv } from '@/client/env'
import { queryClient } from './queryClientInstance'

export function QueryProvider({ children }: { children: ReactNode }) {
  const importMetaEnv = (import.meta as ImportMeta & { env?: ClientImportMetaEnv }).env

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {isDevelopmentClientEnv(importMetaEnv) ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  )
}
