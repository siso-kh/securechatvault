import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import DamaskBackground from '../../components/common/DamaskBackground'
import Field from '../../components/common/Field'
import Button from '../../components/common/Button'
import useAuth from '../../hooks/useAuth'

export default function AdminLogin() {
  const { user, adminLogin, logout } = useAuth()
  const navigate = useNavigate()

  const [passcode, setPasscode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (user?.role === 'admin') {
    return <Navigate to="/admin/dashboard" replace />
  }

  const onSubmit = async (ev) => {
    ev.preventDefault()
    setError('')

    if (!passcode) {
      setError('Enter your passcode.')
      return
    }

    setLoading(true)

    try {
      await adminLogin({ passcode })
      navigate('/admin/dashboard', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <DamaskBackground blurred>
      <div className="flex min-h-screen items-center justify-center p-4">
        <form
          onSubmit={onSubmit}
          noValidate
          className="flex w-full max-w-[430px] flex-col gap-4 rounded-lg border border-line bg-surface p-6"
        >
          <div className="text-center">
            <h1 className="text-4xl">Vault</h1>
            <p className="mt-1 text-xs text-muted">Administrator access</p>
          </div>

          {user && (
            <p className="m-0 rounded-md border border-line px-3 py-2 text-xs text-muted">
              Signed in as {user.email}, which is not an administrator.{' '}
              <button
                type="button"
                onClick={logout}
                className="cursor-pointer underline hover:text-ink"
              >
                Sign out
              </button>
            </p>
          )}

          <Field
            label="Enter your passcode"
            type="password"
            placeholder="••••••••"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            error={error}
            autoComplete="current-password"
            autoFocus
          />

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Unlocking…' : 'Unlock'}
          </Button>
        </form>
      </div>
    </DamaskBackground>
  )
}
