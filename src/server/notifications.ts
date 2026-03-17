export const defaultNotificationAppId = 'Pokarr'
export const defaultNotificationAppDescription = 'Pokarr Sonarr and Radarr automation'
export const defaultNotificationAppUrl = 'https://github.com/kristianvld/pokarr'
export const defaultNotificationLogoUrl = 'https://raw.githubusercontent.com/kristianvld/pokarr/main/public/favicon.png'

const defaultNotificationBrandingParams = {
  app_id: defaultNotificationAppId,
  app_desc: defaultNotificationAppDescription,
  app_url: defaultNotificationAppUrl,
  image_url_logo: defaultNotificationLogoUrl,
  image_url_mask: defaultNotificationLogoUrl
} as const

function hasNonEmptyLastValue(params: URLSearchParams, name: string) {
  const values = params.getAll(name)
  if (values.length === 0) {
    return false
  }

  return values[values.length - 1]?.trim().length > 0
}

export function applyNotificationBranding(rawUrl: string) {
  const trimmed = rawUrl.trim()
  if (!trimmed) {
    return ''
  }

  const fragmentIndex = trimmed.indexOf('#')
  const fragment = fragmentIndex === -1 ? '' : trimmed.slice(fragmentIndex)
  const withoutFragment = fragmentIndex === -1 ? trimmed : trimmed.slice(0, fragmentIndex)
  const queryIndex = withoutFragment.indexOf('?')
  const base = queryIndex === -1 ? withoutFragment : withoutFragment.slice(0, queryIndex)
  const query = queryIndex === -1 ? '' : withoutFragment.slice(queryIndex + 1)
  const params = new URLSearchParams(query)

  for (const [name, value] of Object.entries(defaultNotificationBrandingParams)) {
    if (hasNonEmptyLastValue(params, name)) {
      continue
    }

    params.delete(name)
    params.append(name, value)
  }

  const brandedQuery = params.toString()
  return brandedQuery ? `${base}?${brandedQuery}${fragment}` : `${base}${fragment}`
}
