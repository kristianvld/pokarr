import { describe, expect, test } from 'bun:test'
import {
  applyNotificationBranding,
  defaultNotificationAppId,
  defaultNotificationAppUrl,
  defaultNotificationLogoUrl
} from './notifications'

describe('applyNotificationBranding', () => {
  test('adds default Apprise branding for plain URLs', () => {
    const branded = applyNotificationBranding('discord://123456/abcdef')
    const [base, query = ''] = branded.split('?')
    const params = new URLSearchParams(query)

    expect(base).toBe('discord://123456/abcdef')
    expect(params.get('app_id')).toBe(defaultNotificationAppId)
    expect(params.get('app_url')).toBe(defaultNotificationAppUrl)
    expect(params.get('image_url_logo')).toBe(defaultNotificationLogoUrl)
    expect(params.get('image_url_mask')).toBe(defaultNotificationLogoUrl)
  })

  test('preserves existing query parameters and branding overrides', () => {
    const branded = applyNotificationBranding(
      'json://127.0.0.1:8080?format=text&app_id=Custom&image_url_logo=https%3A%2F%2Fexample.com%2Flogo.png#fragment'
    )
    const [beforeFragment, fragment = ''] = branded.split('#')
    const [, query = ''] = beforeFragment.split('?')
    const params = new URLSearchParams(query)

    expect(fragment).toBe('fragment')
    expect(params.get('format')).toBe('text')
    expect(params.get('app_id')).toBe('Custom')
    expect(params.get('image_url_logo')).toBe('https://example.com/logo.png')
    expect(params.get('app_url')).toBe(defaultNotificationAppUrl)
    expect(params.get('image_url_mask')).toBe(defaultNotificationLogoUrl)
  })

  test('replaces blank branding parameters with defaults', () => {
    const branded = applyNotificationBranding('discord://123456/abcdef?app_id=&image_url_mask=')
    const [, query = ''] = branded.split('?')
    const params = new URLSearchParams(query)

    expect(params.getAll('app_id')).toEqual([defaultNotificationAppId])
    expect(params.getAll('image_url_mask')).toEqual([defaultNotificationLogoUrl])
  })
})
