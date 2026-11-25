
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import DamaskBackground from '../../components/common/DamaskBackground'
import Field from '../../components/common/Field'
import Button from '../../components/common/Button'
import useAuth from '../../hooks/useAuth'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function AdminLogin() {
  const { user, login } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    email: '',
    password: '',
  })

  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [loading, setLoading] = useState(false)

  if (user?.role === 'admin') {
    return <Navigate to="/admin" replace />
  }

  if (user) {
    return <Navigate to="/" replace />
  }

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  const validate = () => {
    const e = {}

    if (!EMAIL_RE.test(form.email)) {
      e.email = 'Enter a valid email address.'
    }

    if (form.password.length < 8) {
      e.password = 'Use at least 8 characters.'
    }

    setErrors(e)
    return Object.keys(e).length === 0
  }

  const onSubmit = async (ev) => {
    ev.preventDefault()
    setSubmitError('')

    if (!validate()) return

    setLoading(true)

    try {
      await login(form)

      const savedUser = JSON.parse(
        localStorage.getItem('vault_session')
      )?.user

      if (savedUser?.role !== 'admin') {
        setSubmitError('You do not have administrator access.')
        return
      }

      navigate('/admin/dashboard', { replace: true })
    } catch (err) {
      setSubmitError(err.message)
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
          className="flex w-full max-w-[290px] flex-col gap-4 rounded-lg border border-line bg-surface p-5 sm:max-w-[320px]"
        >
          <div className="text-center">
            <h1 className="text-4xl">Vault</h1>
            <p className="mt-1 text-xs text-muted">
              Administrator access only.
            </p>
          </div>

          <div className="text-center text-sm text-crimson">
            Admin Login
          </div>

          <Field
            label="Email"
            type="email"
            placeholder="admin@company.com"
            value={form.email}
            onChange={set('email')}
            error={errors.email}
            autoComplete="email"
          />

          <Field
            label="Password"
            type="password"
            value={form.password}
            onChange={set('password')}
            error={errors.password}
            autoComplete="current-password"
          />

          {submitError && (
            <p role="alert" className="m-0 text-xs text-danger">
              {submitError}
            </p>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Please wait…' : 'Sign in as Admin'}
          </Button>
        </form>
      </div>
    </DamaskBackground>
  )
}
