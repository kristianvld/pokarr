export const authRequiredEventName = 'pokarr:auth-required'

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function extractErrorMessage(payload: unknown) {
  if (typeof payload === 'string') {
    return payload
  }

  if (!payload || typeof payload !== 'object') {
    return null
  }

  const candidate = payload as {
    error?:
      | string
      | {
          fieldErrors?: Record<string, string[]>
          formErrors?: string[]
        }
  }

  if (typeof candidate.error === 'string') {
    return candidate.error
  }

  return candidate.error?.formErrors?.[0] ?? Object.values(candidate.error?.fieldErrors ?? {}).flat()[0] ?? null
}

export async function apiRequest<T>(
  path: string,
  options?: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
    body?: unknown
    signal?: AbortSignal
  }
) {
  const response = await fetch(path, {
    method: options?.method ?? 'GET',
    headers:
      options?.body === undefined
        ? undefined
        : {
            'content-type': 'application/json'
          },
    body: options?.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options?.signal
  })

  const payload = (await response.json().catch(() => null)) as unknown
  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(authRequiredEventName))
    }

    throw new ApiError(extractErrorMessage(payload) ?? 'Request failed', response.status)
  }

  return payload as T
}
