import { useState } from 'react';
import { ApiError, api } from '../../api/client';
import { FieldError, Pill } from '../../components/ui';
import { useAuth } from '../../state/AuthContext';
import { useTheme } from '../../state/ThemeContext';
import { useToast } from '../../state/ToastContext';
import { cn } from '../../lib/cn';
import type { ThemeMode } from '../../state/ThemeContext';

export function AccountPage() {
  const { viewer, isSuperAdmin } = useAuth();
  const { mode, setMode } = useTheme();
  const { notify } = useToast();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    setError(null);

    if (next !== confirm) {
      setError('The two new passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      await api('/auth/password', {
        method: 'POST',
        body: { current_password: current, new_password: next },
      });
      setCurrent('');
      setNext('');
      setConfirm('');
      notify('Password changed. Other devices have been signed out.');
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : 'We could not change your password. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const themes: Array<{ value: ThemeMode; label: string }> = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
  ];

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Account settings</h1>
        <p className="mt-1 text-sm text-muted">Your sign-in details and display preference.</p>
      </header>

      <section className="card p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink">Signed in as</h2>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{viewer?.name}</p>
            <p className="truncate text-xs text-muted">{viewer?.email}</p>
          </div>
          <Pill
            className={
              isSuperAdmin
                ? 'border-transparent bg-accent text-accent-ink'
                : 'border-hairline bg-raised text-muted'
            }
          >
            {isSuperAdmin ? 'Super Admin' : 'Staff Admin'}
          </Pill>
        </div>
      </section>

      <section className="card p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink">Appearance</h2>
        <div className="flex gap-1 rounded-lg border border-hairline bg-raised p-0.5">
          {themes.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMode(option.value)}
              aria-pressed={mode === option.value}
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition',
                mode === option.value
                  ? 'bg-surface text-ink shadow-card'
                  : 'text-muted hover:text-ink'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-2xs text-muted">
          System follows your device setting. The choice is saved on this device only.
        </p>
      </section>

      <form onSubmit={submit} className="card space-y-4 p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-ink">Change password</h2>

        <div>
          <label className="field-label" htmlFor="current-password">
            Current password
          </label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(changeEvent) => setCurrent(changeEvent.target.value)}
            className="field"
            required
          />
        </div>

        <div>
          <label className="field-label" htmlFor="new-password">
            New password
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(changeEvent) => setNext(changeEvent.target.value)}
            className="field"
            required
            minLength={10}
          />
          <p className="mt-1 text-2xs text-muted">At least 10 characters.</p>
        </div>

        <div>
          <label className="field-label" htmlFor="confirm-password">
            Confirm new password
          </label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(changeEvent) => setConfirm(changeEvent.target.value)}
            className="field"
            required
            minLength={10}
          />
          <FieldError message={error ?? undefined} />
        </div>

        <button
          type="submit"
          disabled={saving || !current || next.length < 10 || !confirm}
          className="btn btn-md btn-primary"
        >
          {saving ? 'Changing...' : 'Change password'}
        </button>

        <p className="text-2xs text-muted">
          Changing your password signs you out on every other device.
        </p>
      </form>
    </div>
  );
}
