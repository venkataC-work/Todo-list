import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { ApiError } from '@/shared/api/http';
import { useAuth } from '../AuthContext';

export const AuthPage = ({ register = false }: { register?: boolean }) => {
  const { user, login, register: signUp } = useAuth();
  const location = useLocation();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const from: unknown = location.state?.from?.pathname;
  const search: unknown = location.state?.from?.search;
  const hash: unknown = location.state?.from?.hash;
  const destination =
    typeof from === 'string' && (from === '/tasks' || from.startsWith('/tasks/'))
      ? {
          pathname: from,
          search: typeof search === 'string' ? search : '',
          hash: typeof hash === 'string' ? hash : '',
        }
      : '/tasks';

  if (user) return <Navigate to={destination} replace />;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const credentials = {
      email: String(data.get('email')),
      password: String(data.get('password')),
    };
    setPending(true);
    setError('');
    setFields({});
    try {
      if (register) await signUp({ ...credentials, name: String(data.get('name')) });
      else await login(credentials);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in. Please try again.');
      if (cause instanceof ApiError) setFields(cause.fieldErrors);
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="auth-shell">
      <header className="auth-header">
        <Link className="app-title" to="/login">
          Todo list
        </Link>
      </header>
      <section className="auth-panel">
        <div className="auth-card">
          <h1>{register ? 'Create an account' : 'Sign in'}</h1>
          <p className="muted">
            {register ? 'Create an account to save your tasks.' : 'Sign in to see your tasks.'}
          </p>
          <form key={register ? 'register' : 'login'} onSubmit={submit} className="auth-form">
            {register && (
              <div className="field">
                <label htmlFor="name">Your name</label>
                <input
                  id="name"
                  name="name"
                  className="input"
                  required
                  maxLength={80}
                  autoComplete="name"
                  aria-describedby={fields.name ? 'name-error' : undefined}
                  aria-invalid={Boolean(fields.name)}
                />
                {fields.name && (
                  <p id="name-error" className="field__error">
                    {fields.name}
                  </p>
                )}
              </div>
            )}
            <div className="field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                className="input"
                placeholder="you@example.com"
                autoComplete="email"
                required
                aria-describedby={fields.email ? 'email-error' : undefined}
                aria-invalid={Boolean(fields.email)}
              />
              {fields.email && (
                <p id="email-error" className="field__error">
                  {fields.email}
                </p>
              )}
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                className="input"
                placeholder={register ? 'At least 8 characters' : 'Enter your password'}
                autoComplete={register ? 'new-password' : 'current-password'}
                minLength={register ? 8 : 1}
                maxLength={128}
                required
                aria-describedby={fields.password ? 'password-error' : undefined}
                aria-invalid={Boolean(fields.password)}
              />
              {fields.password && (
                <p id="password-error" className="field__error">
                  {fields.password}
                </p>
              )}
            </div>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button className="btn btn--primary" disabled={pending}>
              {pending ? 'Please wait…' : register ? 'Create account' : 'Sign in'}
            </button>
          </form>
          <p className="auth-switch">
            {register ? 'Already have an account?' : 'Don’t have an account?'}{' '}
            <Link
              to={register ? '/login' : '/register'}
              state={location.state}
              onClick={() => {
                setError('');
                setFields({});
              }}
            >
              {register ? 'Sign in' : 'Create an account'}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
};
