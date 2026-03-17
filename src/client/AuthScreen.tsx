import { useState } from 'react'
import { Shield, LockKeyhole } from 'lucide-react'
import { Button } from '@/client/components/ui/button'
import { Card, CardContent } from '@/client/components/ui/card'
import { Input } from '@/client/components/ui/input'
import { authCredentialsSchema } from '@/shared/models'

type AuthMode = 'setup' | 'login'

export function AuthScreen({
  mode,
  error,
  pending,
  username,
  onSubmit
}: {
  mode: AuthMode
  error: string | null
  pending: boolean
  username?: string
  onSubmit: (credentials: { username: string; password: string }) => Promise<void>
}) {
  const [form, setForm] = useState({
    username: username ?? '',
    password: '',
    confirmPassword: ''
  })
  const [localError, setLocalError] = useState<string | null>(null)

  const activeError = localError ?? error
  const isSetup = mode === 'setup'

  function getCredentialsErrorMessage() {
    const parsed = authCredentialsSchema.safeParse({
      username: form.username,
      password: form.password
    })

    if (parsed.success) {
      return null
    }

    const flattened = parsed.error.flatten()
    return flattened.formErrors[0] ?? Object.values(flattened.fieldErrors).flat()[0] ?? 'Enter valid credentials.'
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLocalError(null)

    if (isSetup && form.password !== form.confirmPassword) {
      setLocalError('Passwords do not match.')
      return
    }

    const validationError = getCredentialsErrorMessage()
    if (validationError) {
      setLocalError(validationError)
      return
    }

    try {
      await onSubmit({
        username: form.username,
        password: form.password
      })
    } catch {
      // Mutation state drives the inline error UI.
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-8 text-[var(--foreground)]">
      <Card className="w-full max-w-[460px]">
        <CardContent className="space-y-6 p-6">
          <div className="space-y-3">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-[2px] border border-[var(--line)] bg-[var(--panel-soft)]">
              {isSetup ? <Shield size={22} /> : <LockKeyhole size={22} />}
            </div>
            <div>
              <h1 className="text-[1.35rem] font-semibold text-white">
                {isSetup ? 'Create the admin account' : 'Log in to Pokarr'}
              </h1>
              <p className="mt-2 text-[0.9rem] leading-6 text-[var(--foreground-soft)]">
                {isSetup
                  ? 'The app is locked until the first admin user is created. This account controls all settings and connected services.'
                  : 'Authenticate to access the operator UI and API.'}
              </p>
            </div>
          </div>

          <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
            <div className="space-y-1.5">
              <label className="text-[0.84rem] font-semibold text-[var(--foreground)]" htmlFor="username">
                Username
              </label>
              <Input
                id="username"
                autoCapitalize="none"
                autoCorrect="off"
                disabled={pending}
                value={form.username}
                onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                placeholder="admin"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[0.84rem] font-semibold text-[var(--foreground)]" htmlFor="password">
                Password
              </label>
              <Input
                id="password"
                disabled={pending}
                type="password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                placeholder={isSetup ? 'Use at least 12 characters' : 'Password'}
              />
            </div>

            {isSetup ? (
              <div className="space-y-1.5">
                <label className="text-[0.84rem] font-semibold text-[var(--foreground)]" htmlFor="confirm-password">
                  Confirm password
                </label>
                <Input
                  id="confirm-password"
                  disabled={pending}
                  type="password"
                  value={form.confirmPassword}
                  onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                  placeholder="Repeat the password"
                />
              </div>
            ) : null}

            {activeError ? <p className="text-[0.82rem] text-[var(--danger)]">{activeError}</p> : null}

            <Button className="w-full" disabled={pending} type="submit">
              {pending ? (isSetup ? 'Creating account...' : 'Logging in...') : isSetup ? 'Create admin user' : 'Log in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
