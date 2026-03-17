import { createHash, randomBytes } from 'node:crypto'
import type { Store } from './db'
import { authSessionSchema, type AuthCredentials, type AuthSession, type AuthUser } from '@/shared/models'

type SessionUser = {
  userId: number
  user: AuthUser
}

type SessionLookup = {
  session: SessionUser | null
  setCookie: string | null
}

function parsePositiveIntEnv(name: string, fallback: number) {
  const raw = process.env[name]
  if (!raw) {
    return fallback
  }

  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function resolveSecureCookie(request: Request) {
  const mode = (process.env.POKARR_COOKIE_SECURE ?? 'auto').trim().toLowerCase()
  if (mode === 'true') {
    return true
  }

  if (mode === 'false') {
    return false
  }

  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()
  if (forwardedProto === 'https') {
    return true
  }

  return new URL(request.url).protocol === 'https:'
}

function serializeCookie(
  request: Request,
  name: string,
  value: string,
  options?: {
    expires?: Date
    maxAge?: number
  }
) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict']

  if (options?.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`)
  }

  if (options?.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`)
  }

  if (resolveSecureCookie(request)) {
    parts.push('Secure')
  }

  return parts.join('; ')
}

function readCookie(request: Request, name: string) {
  const raw = request.headers.get('cookie')
  if (!raw) {
    return null
  }

  for (const part of raw.split(';')) {
    const [rawName, ...valueParts] = part.trim().split('=')
    if (rawName !== name) {
      continue
    }

    return decodeURIComponent(valueParts.join('='))
  }

  return null
}

function hashSessionToken(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function issueSessionToken() {
  return randomBytes(32).toString('base64url')
}

function addDays(base: number, days: number) {
  return new Date(base + days * 24 * 60 * 60 * 1000)
}

function buildPublicSession(session: SessionLookup, setupRequired: boolean): AuthSession {
  return authSessionSchema.parse({
    setupRequired,
    authenticated: Boolean(session.session) && !setupRequired,
    user: setupRequired ? null : session.session?.user ?? null
  })
}

export function createAuthService(store: Store) {
  const cookieName = process.env.POKARR_SESSION_COOKIE_NAME?.trim() || 'pokarr_session'
  const sessionTtlDays = parsePositiveIntEnv('POKARR_SESSION_TTL_DAYS', 30)

  function createSessionCookie(request: Request, token: string) {
    return serializeCookie(request, cookieName, token, {
      expires: addDays(Date.now(), sessionTtlDays),
      maxAge: sessionTtlDays * 24 * 60 * 60
    })
  }

  function clearSessionCookie(request: Request) {
    return serializeCookie(request, cookieName, '', {
      expires: new Date(0),
      maxAge: 0
    })
  }

  async function readSession(request: Request): Promise<SessionLookup> {
    store.pruneExpiredSessions()

    const token = readCookie(request, cookieName)
    if (!token) {
      return {
        session: null,
        setCookie: null
      }
    }

    const session = store.getSessionByTokenHash(hashSessionToken(token))
    if (!session) {
      return {
        session: null,
        setCookie: clearSessionCookie(request)
      }
    }

    if (Date.parse(session.expiresAt) <= Date.now()) {
      store.deleteSession(session.tokenHash)
      return {
        session: null,
        setCookie: clearSessionCookie(request)
      }
    }

    const nextExpiresAt = addDays(Date.now(), sessionTtlDays)
    store.touchSession(session.tokenHash, nextExpiresAt.toISOString())

    return {
      session: {
        userId: session.userId,
        user: session.user
      },
      setCookie: createSessionCookie(request, token)
    }
  }

  async function getSessionStatus(request: Request) {
    const setupRequired = !store.hasUsers()
    const session = setupRequired
      ? {
          session: null,
          setCookie: null
        }
      : await readSession(request)

    return {
      ...session,
      auth: buildPublicSession(session, setupRequired)
    }
  }

  async function setupInitialUser(credentials: AuthCredentials) {
    if (store.hasUsers()) {
      return null
    }

    const passwordHash = await Bun.password.hash(credentials.password)
    const created = store.createInitialUser({
      username: credentials.username,
      passwordHash
    })
    if (!created) {
      return null
    }

    const user = store.getAuthUserByUsername(credentials.username)
    if (!user) {
      return null
    }

    store.recordUserLogin(user.id)

    const token = issueSessionToken()
    store.createSession({
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt: addDays(Date.now(), sessionTtlDays).toISOString()
    })

    return {
      token,
      user: {
        username: user.username
      } satisfies AuthUser
    }
  }

  async function login(credentials: AuthCredentials) {
    const user = store.getAuthUserByUsername(credentials.username)
    if (!user) {
      return null
    }

    const verified = await Bun.password.verify(credentials.password, user.passwordHash)
    if (!verified) {
      return null
    }

    store.recordUserLogin(user.id)

    const token = issueSessionToken()
    store.createSession({
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt: addDays(Date.now(), sessionTtlDays).toISOString()
    })

    return {
      token,
      user: {
        username: user.username
      } satisfies AuthUser
    }
  }

  async function logout(request: Request) {
    const token = readCookie(request, cookieName)
    if (token) {
      store.deleteSession(hashSessionToken(token))
    }
  }

  return {
    clearSessionCookie,
    createSessionCookie,
    getSessionStatus,
    login,
    logout,
    readSession,
    setupInitialUser
  }
}
