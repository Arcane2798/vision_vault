import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { config, isMock } from '@/config/env';
import { useAuth } from '@/context/AuthContext';
import { MOCK_USERS } from '@/mocks/data';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { BrandMark } from '@/components/layout/BrandMark';

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v: typeof errors = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) v.email = 'Enter a valid email address.';
    if (!password) v.password = 'Enter your password.';
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setErrors({ form: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandMark className="h-12 w-12 text-ink-1" />
          <h1 className="mt-3 text-xl font-semibold">{config.appName}</h1>
          <p className="text-sm text-ink-3">Sign in to monitor cameras and review incidents</p>
        </div>

        <form onSubmit={submit} noValidate className="space-y-4 rounded-2xl border border-line bg-surface-1 p-6 shadow-panel">
          <Field label="Email" error={errors.email}>
            {(id, d) => (
              <Input id={id} type="email" autoComplete="username" aria-describedby={d} aria-invalid={!!errors.email} value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            )}
          </Field>
          <Field label="Password" error={errors.password}>
            {(id, d) => (
              <div className="relative">
                <Input
                  id={id}
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  aria-describedby={d}
                  aria-invalid={!!errors.password}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-3 hover:text-ink-1">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            )}
          </Field>
          {errors.form && (
            <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger-fg">
              {errors.form}
            </p>
          )}
          <Button type="submit" variant="primary" className="w-full" loading={busy} icon={<LogIn className="h-4 w-4" />}>
            Sign in
          </Button>
        </form>

        {isMock && (
          <div className="mt-4 rounded-xl border border-warn/30 bg-warn/10 p-4 text-xs text-warn-fg">
            <p className="mb-2 font-semibold">Sample accounts (mock mode only)</p>
            <ul className="space-y-1.5">
              {MOCK_USERS.map((u) => (
                <li key={u.id}>
                  <button type="button" className="text-left hover:underline" onClick={() => (setEmail(u.email), setPassword(u.password))}>
                    <span className="font-mono">{u.email}</span> / <span className="font-mono">{u.password}</span> <span className="text-warn-fg/70">({u.role})</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
