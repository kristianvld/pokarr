import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { Store } from './db'
import { createRuntime } from './runtime'

const tempDirs: string[] = []
const stores: Store[] = []
const originalFetch = globalThis.fetch

async function createTestRuntime() {
  const dataDir = await mkdtemp(resolve(tmpdir(), 'pokarr-runtime-'))
  tempDirs.push(dataDir)

  const store = new Store({ dataDir })
  await store.init()
  stores.push(store)

  return {
    runtime: createRuntime(store),
    store
  }
}

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: {
      'content-type': 'application/json'
    }
  })
}

afterEach(async () => {
  globalThis.fetch = originalFetch

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

describe('runtime scanning and queue rebuild', () => {
  test('loads every Sonarr missing page during a full scan and rebuilds the queue from cached scan data', async () => {
    const { runtime, store } = await createTestRuntime()

    const instance = store.createInstance({
      kind: 'sonarr',
      name: 'Primary Sonarr',
      baseUrl: 'http://sonarr.local',
      apiKey: 'primary-api-key',
      enabled: true
    })

    store.createRule({
      instanceId: instance.id,
      name: 'Catch missing series',
      cadenceMinutes: 30,
      batchSize: 10,
      cooldownHours: 24,
      targetKind: 'series',
      scope: {
        missingOnly: true,
        useProfileTargets: false,
        minimumQuality: null,
        minimumCustomFormatScore: null
      },
      guards: {
        monitoredOnly: true,
        minimumReleaseAgeMinutes: 0
      },
      backoff: {
        enabled: false,
        escalateAfterPokes: 3,
        episodeFallback: false
      },
      enabled: true
    })

    const requests: string[] = []
    globalThis.fetch = (async (input) => {
      const request = input instanceof Request ? input : new Request(input)
      const url = new URL(request.url)
      requests.push(`${url.pathname}${url.search}`)

      if (url.pathname === '/api/v3/wanted/missing') {
        const page = Number(url.searchParams.get('page') ?? '1')
        if (page === 1) {
          return jsonResponse({
            page: 1,
            pageSize: 5000,
            totalRecords: 5001,
            records: [
              {
                id: 101,
                seriesId: 1,
                seasonNumber: 1,
                monitored: true,
                airDateUtc: '2024-01-01T00:00:00.000Z'
              }
            ]
          })
        }

        if (page === 2) {
          return jsonResponse({
            page: 2,
            pageSize: 5000,
            totalRecords: 5001,
            records: [
              {
                id: 202,
                seriesId: 2,
                seasonNumber: 1,
                monitored: true,
                airDateUtc: '2024-01-02T00:00:00.000Z'
              }
            ]
          })
        }

        return jsonResponse({
          page,
          pageSize: 5000,
          totalRecords: 5001,
          records: []
        })
      }

      if (url.pathname === '/api/v3/series') {
        return jsonResponse([
          {
            id: 1,
            title: 'Alpha',
            titleSlug: 'alpha',
            monitored: true,
            seasons: [{ seasonNumber: 1, monitored: true }]
          },
          {
            id: 2,
            title: 'Beta',
            titleSlug: 'beta',
            monitored: true,
            seasons: [{ seasonNumber: 1, monitored: true }]
          }
        ])
      }

      if (url.pathname === '/api/v3/qualitydefinition') {
        return jsonResponse([])
      }

      if (url.pathname === '/api/v3/qualityprofile') {
        return jsonResponse([])
      }

      if (url.pathname === '/api/v3/episode') {
        const seriesId = Number(url.searchParams.get('seriesId'))
        return jsonResponse([
          {
            id: seriesId === 1 ? 101 : 202,
            seriesId,
            seasonNumber: 1,
            monitored: true,
            airDateUtc: seriesId === 1 ? '2024-01-01T00:00:00.000Z' : '2024-01-02T00:00:00.000Z',
            hasFile: false,
            episodeFileId: null
          }
        ])
      }

      if (url.pathname === '/api/v3/episodefile') {
        return jsonResponse([])
      }

      throw new Error(`Unexpected request: ${url.toString()}`)
    }) as typeof fetch

    expect(runtime.requestFullScan(instance.id)).toBe(1)
    await runtime.waitForBackgroundIdle()

    const scanStatus = runtime.getScanStatus()
    const snapshot = await runtime.rebuildMaterializedQueue()

    expect(requests).toContain(
      '/api/v3/wanted/missing?page=2&pageSize=5000&sortKey=airDateUtc&sortDirection=ascending&includeSeries=true'
    )
    expect(scanStatus.instances[0]?.lastFullScanAt).not.toBeNull()
    expect(snapshot.issues).toEqual([])
    expect(snapshot.items.map((item) => item.title)).toEqual(['Alpha', 'Beta'])
  })

  test('skips a rule run when scan data is missing and queues a priority full scan', async () => {
    const { runtime, store } = await createTestRuntime()

    const instance = store.createInstance({
      kind: 'sonarr',
      name: 'Primary Sonarr',
      baseUrl: 'http://sonarr.local',
      apiKey: 'primary-api-key',
      enabled: true
    })

    const rule = store.createRule({
      instanceId: instance.id,
      name: 'Catch missing series',
      cadenceMinutes: 30,
      batchSize: 10,
      cooldownHours: 24,
      targetKind: 'series',
      scope: {
        missingOnly: true,
        useProfileTargets: false,
        minimumQuality: null,
        minimumCustomFormatScore: null
      },
      guards: {
        monitoredOnly: true,
        minimumReleaseAgeMinutes: 0
      },
      backoff: {
        enabled: false,
        escalateAfterPokes: 3,
        episodeFallback: false
      },
      enabled: true
    })

    globalThis.fetch = (async (input) => {
      const request = input instanceof Request ? input : new Request(input)
      const url = new URL(request.url)

      if (url.pathname === '/api/v3/wanted/missing') {
        return jsonResponse({
          page: 1,
          pageSize: 5000,
          totalRecords: 1,
          records: [
            {
              id: 101,
              seriesId: 1,
              seasonNumber: 1,
              monitored: true,
              airDateUtc: '2024-01-01T00:00:00.000Z'
            }
          ]
        })
      }

      if (url.pathname === '/api/v3/series') {
        return jsonResponse([
          {
            id: 1,
            title: 'Alpha',
            titleSlug: 'alpha',
            monitored: true,
            seasons: [{ seasonNumber: 1, monitored: true }]
          }
        ])
      }

      if (url.pathname === '/api/v3/qualitydefinition' || url.pathname === '/api/v3/qualityprofile') {
        return jsonResponse([])
      }

      if (url.pathname === '/api/v3/episode') {
        return jsonResponse([
          {
            id: 101,
            seriesId: 1,
            seasonNumber: 1,
            monitored: true,
            airDateUtc: '2024-01-01T00:00:00.000Z',
            hasFile: false,
            episodeFileId: null
          }
        ])
      }

      if (url.pathname === '/api/v3/episodefile') {
        return jsonResponse([])
      }

      if (url.pathname === '/api/v3/command') {
        throw new Error('Rule run should not dispatch while the cache is cold.')
      }

      throw new Error(`Unexpected request: ${url.toString()}`)
    }) as typeof fetch

    const run = await runtime.runRule(rule.id, 'manual')
    expect(run.status).toBe('skipped')
    expect(run.summary).toContain('scan')

    await runtime.waitForBackgroundIdle()
    expect(runtime.getScanStatus().instances[0]?.lastFullScanAt).not.toBeNull()
  })

  test('records dispatched, failed, and deferred item details for a rule run', async () => {
    const { runtime, store } = await createTestRuntime()

    const instance = store.createInstance({
      kind: 'sonarr',
      name: 'Primary Sonarr',
      baseUrl: 'http://sonarr.local',
      apiKey: 'primary-api-key',
      enabled: true
    })

    const rule = store.createRule({
      instanceId: instance.id,
      name: 'Track run results',
      cadenceMinutes: 30,
      batchSize: 3,
      cooldownHours: 24,
      targetKind: 'series',
      scope: {
        missingOnly: true,
        useProfileTargets: false,
        minimumQuality: null,
        minimumCustomFormatScore: null
      },
      guards: {
        monitoredOnly: true,
        minimumReleaseAgeMinutes: 0
      },
      backoff: {
        enabled: false,
        escalateAfterPokes: 3,
        episodeFallback: false
      },
      enabled: true
    })

    let commandCalls = 0
    globalThis.fetch = (async (input) => {
      const request = input instanceof Request ? input : new Request(input)
      const url = new URL(request.url)

      if (url.pathname === '/api/v3/wanted/missing') {
        return jsonResponse({
          page: 1,
          pageSize: 5000,
          totalRecords: 3,
          records: [
            {
              id: 101,
              seriesId: 1,
              seasonNumber: 1,
              monitored: true,
              airDateUtc: '2024-01-01T00:00:00.000Z'
            },
            {
              id: 202,
              seriesId: 2,
              seasonNumber: 1,
              monitored: true,
              airDateUtc: '2024-01-02T00:00:00.000Z'
            },
            {
              id: 303,
              seriesId: 3,
              seasonNumber: 1,
              monitored: true,
              airDateUtc: '2024-01-03T00:00:00.000Z'
            }
          ]
        })
      }

      if (url.pathname === '/api/v3/series') {
        return jsonResponse([
          {
            id: 1,
            title: 'Alpha',
            titleSlug: 'alpha',
            monitored: true,
            seasons: [{ seasonNumber: 1, monitored: true }]
          },
          {
            id: 2,
            title: 'Beta',
            titleSlug: 'beta',
            monitored: true,
            seasons: [{ seasonNumber: 1, monitored: true }]
          },
          {
            id: 3,
            title: 'Gamma',
            titleSlug: 'gamma',
            monitored: true,
            seasons: [{ seasonNumber: 1, monitored: true }]
          }
        ])
      }

      if (url.pathname === '/api/v3/qualitydefinition' || url.pathname === '/api/v3/qualityprofile') {
        return jsonResponse([])
      }

      if (url.pathname === '/api/v3/episode') {
        const seriesId = Number(url.searchParams.get('seriesId'))
        return jsonResponse([
          {
            id: seriesId * 100,
            seriesId,
            seasonNumber: 1,
            monitored: true,
            airDateUtc: `2024-01-0${seriesId}T00:00:00.000Z`,
            hasFile: false,
            episodeFileId: null
          }
        ])
      }

      if (url.pathname === '/api/v3/episodefile') {
        return jsonResponse([])
      }

      if (url.pathname === '/api/v3/command') {
        commandCalls += 1

        if (commandCalls === 1) {
          return jsonResponse({ id: 1, state: 'queued' })
        }

        return new Response('upstream unavailable', {
          status: 502,
          statusText: 'Bad Gateway'
        })
      }

      throw new Error(`Unexpected request: ${url.toString()}`)
    }) as typeof fetch

    expect(runtime.requestFullScan(instance.id)).toBe(1)
    await runtime.waitForBackgroundIdle()

    const run = await runtime.runRule(rule.id, 'manual')

    expect(run.status).toBe('failed')
    expect(run.dispatchedCount).toBe(1)
    expect(run.details.dispatched.map((item) => item.title)).toEqual(['Alpha'])
    expect(run.details.failed.map((item) => item.title)).toEqual(['Beta'])
    expect(run.details.deferred.map((item) => item.title)).toEqual(['Gamma'])
    expect(run.details.notes).toContain('1 pending search was left for a later run.')
  })
})
