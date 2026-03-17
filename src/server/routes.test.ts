import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createAuthService } from './auth'
import { Store } from './db'
import { createApiFetchHandler } from './routes'
import type { ServerRuntime } from './runtime'

const tempDirs: string[] = []
const stores: Store[] = []

async function createTestContext(runtimeOverrides?: Partial<ServerRuntime>) {
  const dataDir = await mkdtemp(resolve(tmpdir(), 'pokarr-routes-'))
  tempDirs.push(dataDir)

  const store = new Store({ dataDir })
  await store.init()
  stores.push(store)

  const auth = createAuthService(store)
  const runtime = {
    getScanStatus: () => ({
      worker: {
        state: 'idle',
        detailConcurrency: 6,
        detailBatchSize: 30,
        queueLength: 0,
        lastQueueRebuildAt: null,
        lastQueueRebuildDurationMs: null,
        lastError: null,
        activeJob: null,
        queuedJobs: []
      },
      instances: [],
      runs: [],
      queueUpdatedAt: null
    }),
    isRestoreInProgress: () => false,
    requestFullScan: () => 0,
    requestQueueRefresh: () => undefined,
    requestScan: () => true,
    ...runtimeOverrides
  } as unknown as ServerRuntime

  return {
    auth,
    fetch: createApiFetchHandler({
      store,
      auth,
      runtime
    }),
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

describe('api routes', () => {
  test('returns 400 for malformed JSON bodies', async () => {
    const { fetch } = await createTestContext()

    const response = await fetch(
      new Request('http://localhost/api/auth/setup', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: '{bad json'
      })
    )

    expect(response).not.toBeNull()
    if (!response) {
      throw new Error('Expected a response for API route')
    }

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Request body must be valid JSON.'
    })
  })

  test('refreshes the session cookie on authenticated operator responses', async () => {
    const { auth, fetch } = await createTestContext()

    const setup = await auth.setupInitialUser({
      username: 'admin',
      password: 'correct horse battery'
    })
    expect(setup).not.toBeNull()

    const sessionCookie = auth.createSessionCookie(
      new Request('http://localhost/api/auth/setup'),
      setup!.token
    )

    const response = await fetch(
      new Request('http://localhost/api/state', {
        headers: {
          cookie: cookieHeader(sessionCookie)
        }
      })
    )

    expect(response).not.toBeNull()
    if (!response) {
      throw new Error('Expected a response for API route')
    }

    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain(cookieHeader(sessionCookie))
  })

  test('returns a structured backup error when manual backup creation fails', async () => {
    const { auth, fetch } = await createTestContext({
      createBackupAndNotify: async () => {
        throw new Error('Disk full')
      }
    })

    const setup = await auth.setupInitialUser({
      username: 'admin',
      password: 'correct horse battery'
    })
    expect(setup).not.toBeNull()

    const sessionCookie = auth.createSessionCookie(
      new Request('http://localhost/api/auth/setup'),
      setup!.token
    )

    const response = await fetch(
      new Request('http://localhost/api/backups', {
        method: 'POST',
        headers: {
          cookie: cookieHeader(sessionCookie)
        }
      })
    )

    expect(response).not.toBeNull()
    if (!response) {
      throw new Error('Expected a response for API route')
    }

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Disk full'
    })
  })

  test('returns scan status for authenticated operators', async () => {
    const { auth, fetch } = await createTestContext()

    const setup = await auth.setupInitialUser({
      username: 'admin',
      password: 'correct horse battery'
    })
    expect(setup).not.toBeNull()

    const sessionCookie = auth.createSessionCookie(
      new Request('http://localhost/api/auth/setup'),
      setup!.token
    )

    const response = await fetch(
      new Request('http://localhost/api/scans/status', {
        headers: {
          cookie: cookieHeader(sessionCookie)
        }
      })
    )

    expect(response).not.toBeNull()
    if (!response) {
      throw new Error('Expected a response for API route')
    }

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      worker: {
        state: 'idle'
      },
      instances: [],
      runs: []
    })
  })
})
