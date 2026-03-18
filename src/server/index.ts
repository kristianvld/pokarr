import { statSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { Store } from './db'
import { createAuthService } from './auth'
import { createApiFetchHandler } from './routes'
import { createRuntime } from './runtime'
import { configureProcessTimeZone } from './timezone'

configureProcessTimeZone()

const store = new Store()
await store.init()

const auth = createAuthService(store)
const runtime = createRuntime(store)
const apiFetch = createApiFetchHandler({
  store,
  auth,
  runtime
})

export function startServer(homepage: unknown) {
  const appRoot = process.env.POKARR_APP_ROOT ?? process.cwd()
  const buildRoot = process.env.POKARR_APP_ROOT ? process.cwd() : null

  function serveBuiltAsset(pathname: string) {
    if (!buildRoot || pathname === '/') {
      return null
    }

    const relativePath = pathname.replace(/^\/+/, '')
    if (!relativePath) {
      return null
    }

    const filePath = resolve(buildRoot, relativePath)
    if (!filePath.startsWith(`${buildRoot}/`) && filePath !== buildRoot) {
      return null
    }

    try {
      const stats = statSync(filePath)
      if (!stats.isFile()) {
        return null
      }
    } catch {
      return null
    }

    return new Response(Bun.file(filePath), {
      headers: {
        'cache-control': extname(filePath) === '.html' ? 'no-store' : 'public, max-age=31536000, immutable'
      }
    })
  }

  const server = Bun.serve({
    port: Number(process.env.PORT ?? '3000'),
    routes: {
      '/': homepage as never,
      '/favicon.svg': new Response(Bun.file(resolve(appRoot, 'public', 'favicon.svg'))),
      '/favicon.png': new Response(Bun.file(resolve(appRoot, 'public', 'favicon.png')))
    },
    async fetch(request) {
      const response = await apiFetch(request)
      if (response) {
        return response
      }

      const staticAsset = serveBuiltAsset(new URL(request.url).pathname)
      if (staticAsset) {
        return staticAsset
      }

      return Response.json(
        { error: 'Not found' },
        {
          status: 404,
          headers: {
            'cache-control': 'no-store'
          }
        }
      )
    }
  })

  runtime.startScheduler()

  console.log(`pokarr listening on http://localhost:${server.port}`)

  return server
}
