import { access, mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

type SmokeOptions = {
  url: string | null
}

type ManagedServer = {
  baseUrl: string
  cleanup: () => Promise<void>
}

function parseArgs(argv: string[]): SmokeOptions {
  let url: string | null = null

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--url') {
      url = argv[index + 1] ?? null
      index += 1
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return { url }
}

async function ensureBuiltAppExists() {
  await access(resolve(process.cwd(), 'dist', 'index.html'))
}

async function reservePort() {
  return await new Promise<number>((resolvePort, reject) => {
    const server = createServer()

    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to determine a free port.')))
        return
      }

      const { port } = address
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolvePort(port)
      })
    })
  })
}

function collectStream(stream: ReadableStream<Uint8Array> | null) {
  if (!stream) {
    return {
      current: () => '',
      done: Promise.resolve('')
    }
  }

  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let output = ''

  const done = (async () => {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) {
        output += decoder.decode()
        return output
      }

      output += decoder.decode(chunk.value, { stream: true })
    }
  })()

  return {
    current: () => output,
    done
  }
}

async function waitForServer(url: string, timeoutMs = 15_000) {
  const startedAt = Date.now()
  const healthUrl = new URL('/api/auth/session', url).toString()

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(healthUrl)
      if (response.ok) {
        return
      }
    } catch {
      // Retry until the timeout expires.
    }

    await Bun.sleep(200)
  }

  throw new Error(`Timed out waiting for ${healthUrl}.`)
}

async function startBuiltServer(): Promise<ManagedServer> {
  await ensureBuiltAppExists()

  const dataDir = await mkdtemp(resolve(tmpdir(), 'pokarr-smoke-'))
  const port = await reservePort()
  const baseUrl = `http://127.0.0.1:${port}`

  const child = Bun.spawn({
    cmd: [process.execPath, 'run', 'start'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      POKARR_DATA_DIR: dataDir
    },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe'
  })

  const stdout = collectStream(child.stdout)
  const stderr = collectStream(child.stderr)

  try {
    await waitForServer(baseUrl)
  } catch (error) {
    child.kill()
    const [stdoutText, stderrText] = await Promise.all([stdout.done, stderr.done])
    await rm(dataDir, { recursive: true, force: true })

    const detail = [stdoutText.trim(), stderrText.trim()].filter(Boolean).join('\n')
    throw new Error(
      detail
        ? `Built server did not become ready.\n${detail}`
        : error instanceof Error
          ? error.message
          : 'Built server did not become ready.'
    )
  }

  return {
    baseUrl,
    cleanup: async () => {
      child.kill()
      await Promise.allSettled([child.exited, stdout.done, stderr.done])
      await rm(dataDir, { recursive: true, force: true })
    }
  }
}

function isExpectedBrowserInstallError(error: unknown) {
  return error instanceof Error && /Executable doesn't exist/i.test(error.message)
}

async function smokeUrl(baseUrl: string) {
  const browser = await chromium.launch({ headless: true }).catch((error) => {
    if (isExpectedBrowserInstallError(error)) {
      throw new Error('Chromium is not installed. Run `bunx playwright install chromium` first.')
    }

    throw error
  })

  const context = await browser.newContext()
  const page = await context.newPage()
  const origin = new URL(baseUrl).origin
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  const failedResponses: string[] = []
  const failedRequests: string[] = []

  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })

  page.on('requestfailed', (request) => {
    const url = new URL(request.url())
    if (url.origin !== origin) {
      return
    }

    const errorText = request.failure()?.errorText ?? 'Request failed'
    if (errorText === 'net::ERR_ABORTED') {
      return
    }

    failedRequests.push(`${errorText} ${url.pathname}`)
  })

  page.on('response', (response) => {
    const url = new URL(response.url())
    if (url.origin !== origin || response.status() < 400) {
      return
    }

    failedResponses.push(`${response.status()} ${url.pathname}`)
  })

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })

    const heading = page.getByRole('heading', { level: 1 }).first()
    await heading.waitFor({ timeout: 10_000 })

    const headingText = (await heading.textContent())?.trim() ?? ''
    const validHeadings = new Set(['Create the admin account', 'Log in to Pokarr'])
    if (!validHeadings.has(headingText)) {
      throw new Error(`Unexpected application heading: ${headingText || '(empty)'}`)
    }

    await page.waitForLoadState('networkidle', { timeout: 10_000 })
  } finally {
    await context.close()
    await browser.close()
  }

  const failures = [
    ...pageErrors.map((message) => `Page error: ${message}`),
    ...consoleErrors.map((message) => `Console error: ${message}`),
    ...failedRequests.map((message) => `Request failed: ${message}`),
    ...failedResponses.map((message) => `HTTP error: ${message}`)
  ]

  if (failures.length > 0) {
    throw new Error(`Built UI smoke test failed.\n${failures.join('\n')}`)
  }
}

const options = parseArgs(process.argv.slice(2))
const managedServer = options.url
  ? {
      baseUrl: options.url,
      cleanup: async () => {}
    }
  : await startBuiltServer()

try {
  await smokeUrl(managedServer.baseUrl)
  console.log(`Built UI smoke test passed for ${managedServer.baseUrl}`)
} finally {
  await managedServer.cleanup()
}
