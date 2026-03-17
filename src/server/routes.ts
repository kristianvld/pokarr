import { z } from 'zod'
import type { Store } from './db'
import { createAuthService } from './auth'
import type { ServerRuntime } from './runtime'
import {
  authCredentialsSchema,
  instanceInputSchema,
  ruleInputSchema,
  ruleUpdateSchema,
  scanKindSchema,
  settingsUpdateSchema
} from '@/shared/models'

const instanceTestRequestSchema = instanceInputSchema.extend({
  persistId: z.number().int().positive().optional()
})
const scanRequestSchema = z.object({
  instanceId: z.number().int().positive().nullable().optional(),
  kind: scanKindSchema.default('full')
})

async function readJsonBody(request: Request) {
  try {
    return {
      success: true as const,
      data: (await request.json()) as unknown
    }
  } catch {
    return {
      success: false as const
    }
  }
}

export function createApiFetchHandler({
  store,
  auth,
  runtime
}: {
  store: Store
  auth: ReturnType<typeof createAuthService>
  runtime: ServerRuntime
}) {
  return async function fetch(request: Request) {
    const url = new URL(request.url)
    const pathname = url.pathname
    let sessionSetCookie: string | null = null

    function json(data: unknown, status = 200, headers?: HeadersInit) {
      const responseHeaders = new Headers(headers)
      responseHeaders.set('cache-control', 'no-store')
      if (sessionSetCookie && !responseHeaders.has('set-cookie')) {
        responseHeaders.set('set-cookie', sessionSetCookie)
      }

      return Response.json(data, {
        status,
        headers: responseHeaders
      })
    }

    function withSessionCookie(response: Response) {
      if (!sessionSetCookie || response.headers.has('set-cookie')) {
        return response
      }

      const headers = new Headers(response.headers)
      headers.set('set-cookie', sessionSetCookie)
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      })
    }

    const parseJsonInput = async <T extends z.ZodTypeAny>(schema: T) => {
      const body = await readJsonBody(request)
      if (!body.success) {
        return {
          success: false as const,
          response: json({ error: 'Request body must be valid JSON.' }, 400)
        }
      }

      const payload = schema.safeParse(body.data)
      if (!payload.success) {
        return {
          success: false as const,
          response: json({ error: payload.error.flatten() }, 400)
        }
      }

      return {
        success: true as const,
        data: payload.data
      }
    }

    if (pathname === '/api/auth/session' && request.method === 'GET') {
      const sessionStatus = await auth.getSessionStatus(request)
      return json(
        sessionStatus.auth,
        200,
        sessionStatus.setCookie ? { 'set-cookie': sessionStatus.setCookie } : undefined
      )
    }

    if (pathname === '/api/auth/setup' && request.method === 'POST') {
      if (store.hasUsers()) {
        return json({ error: 'Initial setup is already complete.' }, 409)
      }

      const payload = await parseJsonInput(authCredentialsSchema)
      if (!payload.success) {
        return payload.response
      }

      const result = await auth.setupInitialUser(payload.data)
      if (!result) {
        return json({ error: 'Failed to create the initial admin user.' }, 409)
      }

      return json(
        {
          setupRequired: false,
          authenticated: true,
          user: result.user
        },
        201,
        {
          'set-cookie': auth.createSessionCookie(request, result.token)
        }
      )
    }

    if (pathname === '/api/auth/login' && request.method === 'POST') {
      if (!store.hasUsers()) {
        return json({ error: 'Initial setup is required before login.' }, 409)
      }

      const payload = await parseJsonInput(authCredentialsSchema)
      if (!payload.success) {
        return payload.response
      }

      const result = await auth.login(payload.data)
      if (!result) {
        return json({ error: 'Invalid username or password.' }, 401)
      }

      return json(
        {
          setupRequired: false,
          authenticated: true,
          user: result.user
        },
        200,
        {
          'set-cookie': auth.createSessionCookie(request, result.token)
        }
      )
    }

    if (pathname === '/api/auth/logout' && request.method === 'POST') {
      await auth.logout(request)
      return json({ ok: true }, 200, {
        'set-cookie': auth.clearSessionCookie(request)
      })
    }

    if (pathname.startsWith('/api/')) {
      const session = await auth.readSession(request)
      sessionSetCookie = session.setCookie
      if (!store.hasUsers()) {
        return json({ error: 'Initial setup is required.' }, 401)
      }

      if (!session.session) {
        return json({ error: 'Authentication required.' }, 401)
      }
    }

    if (runtime.isRestoreInProgress() && pathname.startsWith('/api/')) {
      return json({ error: 'Backup restore is in progress. Try again in a moment.' }, 503)
    }

    if (pathname === '/api/health' && request.method === 'GET') {
      return json({ status: runtime.isRestoreInProgress() ? 'restoring' : 'ok' })
    }

    if (pathname === '/api/state' && request.method === 'GET') {
      return json(store.getState())
    }

    if (pathname === '/api/scans/status' && request.method === 'GET') {
      return json(runtime.getScanStatus())
    }

    if (pathname === '/api/scans/run' && request.method === 'POST') {
      const payload = await parseJsonInput(scanRequestSchema)
      if (!payload.success) {
        return payload.response
      }

      if (payload.data.instanceId != null) {
        const instance = store.getInstanceConnection(payload.data.instanceId)
        if (!instance) {
          return json({ error: 'Instance not found' }, 404)
        }

        runtime.requestScan(instance.id, payload.data.kind, 'manual')
        return json({ queued: 1 }, 202)
      }

      if (payload.data.kind === 'full') {
        return json({ queued: runtime.requestFullScan(null) }, 202)
      }

      let queued = 0
      for (const instance of store.getInstances().filter((item) => item.enabled)) {
        runtime.requestScan(instance.id, 'incremental', 'manual')
        queued += 1
      }

      return json({ queued }, 202)
    }

    if (pathname === '/api/queue/rebuild' && request.method === 'POST') {
      try {
        const queue = await runtime.rebuildMaterializedQueue()
        return json({
          state: store.getState(),
          queue
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to rebuild the queue.'
        return json({ error: message }, 500)
      }
    }

    if (pathname === '/api/instances' && request.method === 'POST') {
      const payload = await parseJsonInput(instanceInputSchema)
      if (!payload.success) {
        return payload.response
      }

      const instance = store.createInstance(payload.data)
      runtime.requestScan(instance.id, 'full', 'instance_change')
      runtime.requestQueueRefresh()
      return json({ instance }, 201)
    }

    if (pathname === '/api/instances/test' && request.method === 'POST') {
      const payload = await parseJsonInput(instanceTestRequestSchema)
      if (!payload.success) {
        return payload.response
      }

      return withSessionCookie(await runtime.validateInstanceInput(payload.data, payload.data.persistId))
    }

    if (pathname.match(/^\/api\/instances\/\d+$/) && request.method === 'GET') {
      const id = Number(pathname.split('/')[3])
      const instance = store.getInstanceConnection(id)
      if (!instance) {
        return json({ error: 'Instance not found' }, 404)
      }

      return json({ instance })
    }

    if (pathname.match(/^\/api\/instances\/\d+$/) && request.method === 'PUT') {
      const id = Number(pathname.split('/')[3])
      const payload = await parseJsonInput(instanceInputSchema)
      if (!payload.success) {
        return payload.response
      }

      const instance = store.updateInstance(id, payload.data)
      if (!instance) {
        return json({ error: 'Instance not found' }, 404)
      }

      if (instance.enabled) {
        runtime.requestScan(instance.id, 'full', 'instance_change')
      }
      runtime.requestQueueRefresh()
      return json({ instance })
    }

    if (pathname.match(/^\/api\/instances\/\d+$/) && request.method === 'DELETE') {
      const id = Number(pathname.split('/')[3])
      const deleted = store.deleteInstance(id)
      if (!deleted) {
        return json({ error: 'Instance not found' }, 404)
      }

      runtime.requestQueueRefresh()
      return json({ ok: true })
    }

    if (pathname.match(/^\/api\/instances\/\d+\/validate$/) && request.method === 'POST') {
      const id = Number(pathname.split('/')[3])
      return withSessionCookie(await runtime.validateInstance(id))
    }

    if (pathname.match(/^\/api\/instances\/\d+\/qualities$/) && request.method === 'GET') {
      const id = Number(pathname.split('/')[3])
      const instance = store.getInstanceConnection(id)
      if (!instance) {
        return json({ error: 'Instance not found' }, 404)
      }

      try {
        const qualities = await runtime.fetchQualityOptions(instance)
        return json({ qualities })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load qualities'
        return json({ error: message }, 502)
      }
    }

    if (pathname === '/api/rules' && request.method === 'POST') {
      const payload = await parseJsonInput(ruleInputSchema)
      if (!payload.success) {
        return payload.response
      }

      const instance = store.getInstanceConnection(payload.data.instanceId)
      if (!instance) {
        return json({ error: 'Instance not found' }, 404)
      }

      const targetError = runtime.getRuleTargetError(instance.kind as 'sonarr' | 'radarr', payload.data.targetKind)
      if (targetError) {
        return json({ error: targetError }, 400)
      }

      const rule = store.createRule(payload.data)
      runtime.requestScan(rule.instanceId, 'incremental', 'rule_change')
      runtime.requestQueueRefresh()
      return json({ rule }, 201)
    }

    if (pathname.match(/^\/api\/rules\/\d+$/) && request.method === 'PUT') {
      const id = Number(pathname.split('/')[3])
      const payload = await parseJsonInput(ruleUpdateSchema)
      if (!payload.success) {
        return payload.response
      }

      const instance = store.getInstanceConnection(payload.data.instanceId)
      if (!instance) {
        return json({ error: 'Instance not found' }, 404)
      }

      const targetError = runtime.getRuleTargetError(instance.kind as 'sonarr' | 'radarr', payload.data.targetKind)
      if (targetError) {
        return json({ error: targetError }, 400)
      }

      const rule = store.updateRule(id, payload.data)
      if (!rule) {
        return json({ error: 'Rule not found' }, 404)
      }

      runtime.requestScan(rule.instanceId, 'incremental', 'rule_change')
      runtime.requestQueueRefresh()
      return json({ rule })
    }

    if (pathname.match(/^\/api\/rules\/\d+$/) && request.method === 'DELETE') {
      const id = Number(pathname.split('/')[3])
      const deleted = store.deleteRule(id)
      if (!deleted) {
        return json({ error: 'Rule not found' }, 404)
      }

      runtime.requestQueueRefresh()
      return json({ ok: true })
    }

    if (pathname.match(/^\/api\/rules\/\d+\/enabled$/) && request.method === 'POST') {
      const id = Number(pathname.split('/')[3])
      const payload = await parseJsonInput(z.object({ enabled: z.boolean() }))
      if (!payload.success) {
        return payload.response
      }

      const rule = store.setRuleEnabled(id, payload.data.enabled)
      if (!rule) {
        return json({ error: 'Rule not found' }, 404)
      }

      runtime.requestScan(rule.instanceId, 'incremental', 'rule_change')
      runtime.requestQueueRefresh()
      return json({ rule })
    }

    if (pathname.match(/^\/api\/rules\/\d+\/run$/) && request.method === 'POST') {
      const id = Number(pathname.split('/')[3])
      try {
        const run = await runtime.runRule(id, 'manual')
        return json({ run }, 201)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to run rule.'
        const status = message === 'Rule not found' ? 404 : message === 'This rule is already running.' ? 409 : 400
        return json({ error: message }, status)
      }
    }

    if (pathname.match(/^\/api\/rules\/\d+\/refresh$/) && request.method === 'POST') {
      const id = Number(pathname.split('/')[3])
      const rule = store.getRules().find((item) => item.id === id)
      if (!rule) {
        return json({ error: 'Rule not found' }, 404)
      }

      try {
        const queue = await runtime.rebuildMaterializedQueue()
        return json({
          state: store.getState(),
          queue
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to refresh queue.'
        return json({ error: message }, 500)
      }
    }

    if (pathname === '/api/queue' && request.method === 'GET') {
      return json(store.getQueueSnapshot())
    }

    if (pathname === '/api/settings' && request.method === 'POST') {
      const payload = await parseJsonInput(settingsUpdateSchema)
      if (!payload.success) {
        return payload.response
      }

      try {
        await runtime.validateNotificationUrl(payload.data.notifications.notificationUrl)
      } catch (validationError) {
        return json(
          {
            error:
              validationError instanceof Error
                ? validationError.message
                : 'Notification URL validation failed.'
          },
          400
        )
      }

      const settings = await store.updateSettings(payload.data)
      return json({ settings }, 200)
    }

    if (pathname === '/api/settings/notifications/validate' && request.method === 'POST') {
      const payload = await parseJsonInput(
        z.object({
          url: z.string().nullable().optional()
        })
      )

      if (!payload.success) {
        return payload.response
      }

      try {
        await runtime.validateNotificationUrl(payload.data.url ?? null)
      } catch (validationError) {
        return json(
          {
            error:
              validationError instanceof Error
                ? validationError.message
                : 'Notification URL validation failed.'
          },
          400
        )
      }

      return json({ valid: true }, 200)
    }

    if (pathname === '/api/settings/notifications/test' && request.method === 'POST') {
      const payload = await parseJsonInput(
        z.object({
          url: z.string().nullable().optional()
        })
      )

      if (!payload.success) {
        return payload.response
      }

      try {
        await runtime.sendNotificationTest(payload.data.url ?? null)
      } catch (testError) {
        return json(
          {
            error: testError instanceof Error ? testError.message : 'Failed to send test notification.'
          },
          400
        )
      }

      return json({ ok: true }, 200)
    }

    if (pathname === '/api/backups' && request.method === 'POST') {
      try {
        const backup = await runtime.createBackupAndNotify('manual')
        return json({ backup }, 201)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create backup.'
        const status = message === 'Backup restore is in progress.' ? 409 : 500
        return json({ error: message }, status)
      }
    }

    if (pathname.match(/^\/api\/backups\/\d+\/restore$/) && request.method === 'POST') {
      const id = Number(pathname.split('/')[3])
      const backup = store.getBackupById(id)
      if (!backup) {
        return json({ error: 'Backup not found' }, 404)
      }

      runtime.setRestoreInProgress(true)

      try {
        const idle = await runtime.waitForBackgroundIdle()
        if (!idle) {
          return json(
            {
              error: 'Background work did not go idle in time. Try the restore again after current jobs finish.'
            },
            409
          )
        }

        const restoredBackup = await store.restoreBackup(id)
        const settings = store.getSettings()

        if (settings.notifications.backupSuccess) {
          try {
            await runtime.sendNotification(
              settings.notifications.notificationUrl,
              runtime.buildRestoreCompletedNotification(restoredBackup)
            )
          } catch (notificationError) {
            console.error('failed to send restore success notification', notificationError)
          }
        }

        runtime.setRestoreInProgress(false)
        runtime.requestQueueRefresh()

        return json(
          {
            backup: restoredBackup,
            state: store.getState()
          },
          200
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to restore backup.'

        const settings = store.getSettings()
        if (settings.notifications.backupFailure) {
          try {
            await runtime.sendNotification(
              settings.notifications.notificationUrl,
              runtime.buildRestoreFailedNotification(backup, message)
            )
          } catch (notificationError) {
            console.error('failed to send restore failure notification', notificationError)
          }
        }

        return json({ error: message }, 400)
      } finally {
        runtime.setRestoreInProgress(false)
      }
    }

    if (pathname.startsWith('/api/')) {
      return json({ error: 'Not found' }, 404)
    }

    return null
  }
}
