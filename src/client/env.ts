export type ClientImportMetaEnv = {
  DEV?: boolean
}

export function isDevelopmentClientEnv(env: ClientImportMetaEnv | undefined) {
  return env?.DEV === true
}
