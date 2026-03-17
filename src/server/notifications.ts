import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const defaultNotificationAppId = 'Pokarr'
export const defaultNotificationAppDescription = 'Pokarr Sonarr and Radarr automation'
export const defaultNotificationAppUrl = 'https://github.com/kristianvld/pokarr'
export const defaultNotificationLogoUrl = 'https://raw.githubusercontent.com/kristianvld/pokarr/main/public/favicon.png'

const defaultNotificationBrandingAsset = {
  app_id: defaultNotificationAppId,
  app_desc: defaultNotificationAppDescription,
  app_url: defaultNotificationAppUrl,
  image_url_logo: defaultNotificationLogoUrl,
  image_url_mask: defaultNotificationLogoUrl
} as const

function yamlString(value: string) {
  return JSON.stringify(value)
}

export function buildNotificationConfig(rawUrl: string) {
  const trimmed = rawUrl.trim()
  if (!trimmed) {
    return ''
  }

  const lines = ['version: 1', 'asset:']
  for (const [name, value] of Object.entries(defaultNotificationBrandingAsset)) {
    lines.push(`  ${name}: ${yamlString(value)}`)
  }

  lines.push('urls:')
  lines.push(`  - ${yamlString(trimmed)}`)
  lines.push('')
  return lines.join('\n')
}

export async function withNotificationConfig<T>(rawUrl: string, run: (configPath: string) => Promise<T>): Promise<T> {
  const config = buildNotificationConfig(rawUrl)
  if (!config) {
    throw new Error('Enter a notification URL before continuing.')
  }

  const configDir = await mkdtemp(join(tmpdir(), 'pokarr-apprise-'))
  const configPath = join(configDir, 'apprise.yaml')
  await writeFile(configPath, config, {
    encoding: 'utf8',
    mode: 0o600
  })

  try {
    return await run(configPath)
  } finally {
    await rm(configDir, { recursive: true, force: true })
  }
}
