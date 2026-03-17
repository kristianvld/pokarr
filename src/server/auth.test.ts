import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createAuthService } from './auth'
import { Store } from './db'

const tempDirs: string[] = []
const stores: Store[] = []

async function createTestContext() {
  const dataDir = await mkdtemp(resolve(tmpdir(), 'pokarr-auth-'))
  tempDirs.push(dataDir)

  const store = new Store({ dataDir })
  await store.init()
  stores.push(store)

  return {
    auth: createAuthService(store),
    store
  }
}

function cookieHeader(setCookieValue: string) {
  return setCookieValue.split(';')[0] ?? ''
}

afterEach(async () => {
  while (stores.length > 0) {
    stores.pop()?.close()
  }

  while (tempDirs.length > 0) {
    const dataDir = tempDirs.pop()
    if (!dataDir) {
      continue
    }

    await rm(dataDir, { force: true, recursive: true })
  }
})

describe('auth service', () => {
  test('reports setup required before the first user exists', async () => {
    const { auth } = await createTestContext()

    const status = await auth.getSessionStatus(new Request('http://localhost/api/auth/session'))
    expect(status.auth).toEqual({
      setupRequired: true,
      authenticated: false,
      user: null
    })
  })

  test('creates the initial admin user and authenticates the issued session', async () => {
    const { auth, store } = await createTestContext()

    const setup = await auth.setupInitialUser({
      username: 'admin',
      password: 'correct horse battery'
    })

    expect(setup).not.toBeNull()
    expect(store.hasUsers()).toBe(true)

    const sessionCookie = auth.createSessionCookie(
      new Request('http://localhost/api/auth/setup'),
      setup!.token
    )
    const sessionStatus = await auth.getSessionStatus(
      new Request('http://localhost/api/auth/session', {
        headers: {
          cookie: cookieHeader(sessionCookie)
        }
      })
    )

    expect(sessionStatus.setCookie).toContain('pokarr_session=')
    expect(sessionStatus.auth).toEqual({
      setupRequired: false,
      authenticated: true,
      user: {
        username: 'admin'
      }
    })
  })

  test('rejects duplicate initial setup attempts after an admin already exists', async () => {
    const { auth } = await createTestContext()

    await auth.setupInitialUser({
      username: 'admin',
      password: 'correct horse battery'
    })

    const duplicate = await auth.setupInitialUser({
      username: 'other-admin',
      password: 'another strong password'
    })

    expect(duplicate).toBeNull()
  })

  test('verifies credentials on login and rejects invalid passwords', async () => {
    const { auth } = await createTestContext()

    await auth.setupInitialUser({
      username: 'admin',
      password: 'correct horse battery'
    })

    const denied = await auth.login({
      username: 'admin',
      password: 'wrong password'
    })
    expect(denied).toBeNull()

    const granted = await auth.login({
      username: 'admin',
      password: 'correct horse battery'
    })
    expect(granted?.user.username).toBe('admin')
  })

  test('clears invalid or expired sessions on read', async () => {
    const { auth, store } = await createTestContext()

    const setup = await auth.setupInitialUser({
      username: 'admin',
      password: 'correct horse battery'
    })
    expect(setup).not.toBeNull()

    store.db.query('UPDATE sessions SET expires_at = ?').run(new Date(0).toISOString())

    const status = await auth.getSessionStatus(
      new Request('http://localhost/api/auth/session', {
        headers: {
          cookie: `pokarr_session=${setup!.token}`
        }
      })
    )

    expect(status.setCookie).toContain('Max-Age=0')
    expect(status.auth).toEqual({
      setupRequired: false,
      authenticated: false,
      user: null
    })
  })
})
