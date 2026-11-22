import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import DamaskBackground from '../../components/common/DamaskBackground';
import Tabs from '../../components/common/Tabs';
import Field from '../../components/common/Field';
import Button from '../../components/common/Button';
import useAuth from '../../hooks/useAuth';

const TABS = [
  { value: 'signin', label: 'Sign in' },
  { value: 'signup', label: 'Create account' },
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthPage() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('signin');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const validate = () => {
    const e = {};
    if (mode === 'signup' && !form.name.trim()) e.name = 'Enter your name.';
    if (!EMAIL_RE.test(form.email)) e.email = 'Enter a valid email address.';
    if (form.password.length < 8) e.password = 'Use at least 8 characters.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = async (ev) => {
    ev.preventDefault();
    setSubmitError('');
    if (!validate()) return;
    setLoading(true);
    try {
      mode === 'signin' ? await login(form) : await register(form);
      navigate('/', { replace: true });
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (m) => {
    setMode(m);
    setErrors({});
    setSubmitError('');
  };

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
            <p className="mt-1 text-xs text-muted">Sign in to start a protected chat.</p>
          </div>

          <Tabs tabs={TABS} value={mode} onChange={switchMode} />

          {mode === 'signup' && (
            <Field label="Name" value={form.name} onChange={set('name')} error={errors.name} autoComplete="name" />
          )}
          <Field label="Email" type="email" placeholder="you@company.com" value={form.email}
                 onChange={set('email')} error={errors.email} autoComplete="email" />
          <Field label="Password" type="password" value={form.password}
                 onChange={set('password')} error={errors.password}
                 autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />

          {submitError && <p role="alert" className="m-0 text-xs text-danger">{submitError}</p>}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </Button>
        </form>
      </div>
    </DamaskBackground>
  );
}