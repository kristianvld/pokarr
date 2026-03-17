import { describe, expect, test } from 'bun:test'
import {
  buildNotificationConfig,
  defaultNotificationAppId,
  defaultNotificationAppDescription,
  defaultNotificationAppUrl,
  defaultNotificationLogoUrl
} from './notifications'

describe('buildNotificationConfig', () => {
  test('creates a YAML config with default Apprise branding and the notification URL', () => {
    const config = buildNotificationConfig('discord://123456/abcdef')

    expect(config).toContain('version: 1')
    expect(config).toContain('asset:')
    expect(config).toContain(`app_id: ${JSON.stringify(defaultNotificationAppId)}`)
    expect(config).toContain(`app_desc: ${JSON.stringify(defaultNotificationAppDescription)}`)
    expect(config).toContain(`app_url: ${JSON.stringify(defaultNotificationAppUrl)}`)
    expect(config).toContain(`image_url_logo: ${JSON.stringify(defaultNotificationLogoUrl)}`)
    expect(config).toContain(`image_url_mask: ${JSON.stringify(defaultNotificationLogoUrl)}`)
    expect(config).toContain(`- ${JSON.stringify('discord://123456/abcdef')}`)
  })

  test('preserves the raw notification URL exactly as entered', () => {
    const rawUrl =
      'json://127.0.0.1:8080?format=text&app_id=Custom&image_url_logo=https%3A%2F%2Fexample.com%2Flogo.png#fragment'
    const config = buildNotificationConfig(rawUrl)

    expect(config).toContain(`- ${JSON.stringify(rawUrl)}`)
  })
})
