export const queryKeys = {
  authSession: ['auth-session'] as const,
  appState: ['app-state'] as const,
  queue: ['queue'] as const,
  scanStatus: ['scan-status'] as const,
  instanceConnection: (id: number) => ['instances', id, 'connection'] as const,
  qualityOptions: (id: number) => ['instances', id, 'qualities'] as const,
  notificationValidation: (url: string) => ['notification-validation', url] as const
}
