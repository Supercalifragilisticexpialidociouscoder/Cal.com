import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { FieldError } from '../components/ui';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';

/**
 * Administrators only. Students never see this page unless they look for it
 * (spec 3, 47).
 */
export function LoginPage() {
  const { signIn, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { notify } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const redirectTo =
    (location.state as { from?: string } | null)?.from ?? '/admin';

  // Already signed in: redirect declaratively rather than navigating mid-render.
  if (isAdmin) {
    return <Navigate to={redirectTo} replace />;
  }

  const submit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const viewer = await signIn(email, password);
      notify(`Signed in as ${viewer.name}.`);
      navigate(redirectTo, { replace: true });
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'We could not sign you in. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-sm flex-col justify-center py-8 sm:py-16">
      <div className="mb-6 text-center">
        <span
          aria-hidden="true"
          className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-xl bg-accent text-sm font-bold text-accent-ink"
        >
          i8
        </span>
        <h1 className="text-lg font-semibold tracking-tight text-ink">Administrator sign in</h1>
        <p className="mt-1 text-sm text-muted">
          The Infin8 Calendar is open to everyone. Sign in only to manage events.
        </p>
      </div>

      <form onSubmit={submit} className="card space-y-4 p-5">
        <div>
          <label className="field-label" htmlFor="login-email">
            Username or email
          </label>
          <input
            id="login-email"
            autoFocus
            autoComplete="username"
            value={email}
            onChange={(changeEvent) => setEmail(changeEvent.target.value)}
            className="field"
            required
            maxLength={200}
          />
        </div>

        <div>
          <label className="field-label" htmlFor="login-password">
            Password
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(changeEvent) => setPassword(changeEvent.target.value)}
            className="field"
            required
            maxLength={300}
          />
          <FieldError message={error ?? undefined} />
        </div>

        <button
          type="submit"
          disabled={submitting || !email || !password}
          className="btn btn-md btn-primary w-full"
        >
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <p className="mt-5 text-center text-xs text-muted">
        <Link to="/" className="font-medium text-accent hover:underline">
          Back to the calendar
        </Link>
      </p>
    </div>
  );
}
