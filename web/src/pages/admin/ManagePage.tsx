import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import { invalidate, useQuery } from '../../api/useQuery';
import type {
  AdminUser,
  EventListResponse,
  MetaResponse,
  SourceType,
} from '../../api/types';
import { ConfirmDialog } from '../../components/Modal';
import {
  EmptyState,
  ErrorNotice,
  FieldError,
  Pill,
  SectionHeading,
  SkeletonRows,
} from '../../components/ui';
import { cn } from '../../lib/cn';
import { formatMediumDate, formatTimestamp } from '../../lib/date';
import { SOURCE_LABELS, sourcePill } from '../../lib/taxonomy';
import { useAuth } from '../../state/AuthContext';
import { useToast } from '../../state/ToastContext';

type Tab = 'organisations' | 'venues' | 'administrators' | 'archive';

/**
 * Administration. Organiser, venue and account management are Super Admin
 * work; the archive is available to every administrator.
 */
export function ManagePage() {
  const { isSuperAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>(isSuperAdmin ? 'organisations' : 'archive');

  const tabs: Array<{ value: Tab; label: string; superOnly: boolean }> = [
    { value: 'organisations', label: 'Clubs & departments', superOnly: true },
    { value: 'venues', label: 'Venues', superOnly: true },
    { value: 'administrators', label: 'Administrators', superOnly: true },
    { value: 'archive', label: 'Archive', superOnly: false },
  ];

  const available = tabs.filter((entry) => isSuperAdmin || !entry.superOnly);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Administration</h1>
        <p className="mt-1 text-sm text-muted">
          {isSuperAdmin
            ? 'Organisers, venues, administrator accounts and archived events.'
            : 'Archived events. Organiser and account management is handled by the Super Admin.'}
        </p>
      </header>

      <div role="tablist" aria-label="Administration sections" className="flex flex-wrap gap-1 border-b border-hairline">
        {available.map((entry) => (
          <button
            key={entry.value}
            type="button"
            role="tab"
            aria-selected={tab === entry.value}
            onClick={() => setTab(entry.value)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === entry.value
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-ink'
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'organisations' && isSuperAdmin && <OrganisationsTab />}
      {tab === 'venues' && isSuperAdmin && <VenuesTab />}
      {tab === 'administrators' && isSuperAdmin && <AdministratorsTab />}
      {tab === 'archive' && <ArchiveTab />}
    </div>
  );
}

function OrganisationsTab() {
  const { notify } = useToast();
  const { data, error, loading, reload } = useQuery<MetaResponse>('/meta', { staleMs: 0 });

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<SourceType>('club');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<{ id: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setSaving(true);
    try {
      await api('/meta/organizations', { method: 'POST', body: { name, type } });
      invalidate('/meta');
      setName('');
      setAdding(false);
      reload();
      notify(`"${name}" added.`);
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'We could not add that.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: number, active: boolean, label: string) => {
    try {
      await api(`/meta/organizations/${id}`, { method: 'PATCH', body: { active: !active } });
      invalidate('/meta');
      reload();
      notify(active ? `"${label}" deactivated.` : `"${label}" reactivated.`);
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'We could not update that.', 'error');
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      const response = await api<{ deactivated: boolean; events?: number }>(
        `/meta/organizations/${removing.id}`,
        { method: 'DELETE' }
      );
      invalidate('/meta');
      setRemoving(null);
      reload();
      notify(
        response.deactivated
          ? `"${removing.name}" has events, so it was deactivated instead of deleted.`
          : `"${removing.name}" removed.`
      );
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'We could not remove that.', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorNotice message={error.message} onRetry={reload} />;
  if (loading && !data) return <SkeletonRows rows={4} />;

  const grouped = new Map<SourceType, MetaResponse['organizations']>();
  for (const organization of data?.organizations ?? []) {
    const bucket = grouped.get(organization.type);
    if (bucket) bucket.push(organization);
    else grouped.set(organization.type, [organization]);
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        {adding ? null : (
          <button type="button" onClick={() => setAdding(true)} className="btn btn-sm btn-primary">
            + Add organiser
          </button>
        )}
      </div>

      {adding && (
        <form
          className="card flex flex-wrap items-end gap-3 p-3.5 animate-slide-up"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            void create();
          }}
        >
          <div className="min-w-[12rem] flex-1">
            <label className="field-label" htmlFor="org-name">
              Name
            </label>
            <input
              id="org-name"
              autoFocus
              value={name}
              onChange={(changeEvent) => setName(changeEvent.target.value)}
              className="field"
              required
              maxLength={120}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="org-type">
              Type
            </label>
            <select
              id="org-type"
              value={type}
              onChange={(changeEvent) => setType(changeEvent.target.value as SourceType)}
              className="field"
            >
              {(['institution', 'department', 'club', 'academic', 'other'] as SourceType[]).map((option) => (
                <option key={option} value={option}>
                  {SOURCE_LABELS[option]}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={saving || !name.trim()} className="btn btn-md btn-primary">
            {saving ? 'Adding...' : 'Add'}
          </button>
          <button type="button" onClick={() => setAdding(false)} className="btn btn-md btn-outline">
            Cancel
          </button>
        </form>
      )}

      {[...grouped.entries()].map(([groupType, items]) => (
        <section key={groupType}>
          <SectionHeading title={SOURCE_LABELS[groupType]} count={items.length} />
          <ul className="card divide-y divide-hairline">
            {items.map((organization) => (
              <li key={organization.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <Pill className={sourcePill(organization.type)}>{SOURCE_LABELS[organization.type]}</Pill>
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-sm font-medium',
                    organization.active ? 'text-ink' : 'text-faint line-through'
                  )}
                >
                  {organization.name}
                </span>
                <Link
                  to={`/events?organizer_id=${organization.id}`}
                  className="btn btn-sm btn-ghost text-2xs"
                >
                  Events
                </Link>
                <button
                  type="button"
                  onClick={() => toggleActive(organization.id, organization.active, organization.name)}
                  className="btn btn-sm btn-ghost text-2xs"
                >
                  {organization.active ? 'Deactivate' : 'Reactivate'}
                </button>
                <button
                  type="button"
                  onClick={() => setRemoving({ id: organization.id, name: organization.name })}
                  className="btn btn-sm btn-ghost text-2xs hover:text-error"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <ConfirmDialog
        open={removing !== null}
        title="Remove this organiser?"
        message={`If "${removing?.name ?? ''}" has events, it will be deactivated instead of deleted so past events keep their organiser.`}
        confirmLabel="Remove"
        busy={busy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

function VenuesTab() {
  const { notify } = useToast();
  const { data, error, loading, reload } = useQuery<MetaResponse>('/meta', { staleMs: 0 });
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<{ id: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setSaving(true);
    try {
      await api('/meta/venues', { method: 'POST', body: { name } });
      invalidate('/meta');
      setName('');
      reload();
      notify(`"${name}" added to the venue list.`);
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'We could not add that venue.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api(`/meta/venues/${removing.id}`, { method: 'DELETE' });
      invalidate('/meta');
      setRemoving(null);
      reload();
      notify('Venue removed.');
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'We could not remove that venue.', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorNotice message={error.message} onRetry={reload} />;
  if (loading && !data) return <SkeletonRows rows={3} />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        These are suggestions in the event form. Any location can still be typed in by hand.
      </p>

      <form
        className="card flex flex-wrap items-end gap-3 p-3.5"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          void create();
        }}
      >
        <div className="min-w-[12rem] flex-1">
          <label className="field-label" htmlFor="venue-name">
            Venue name
          </label>
          <input
            id="venue-name"
            value={name}
            onChange={(changeEvent) => setName(changeEvent.target.value)}
            placeholder="Seminar Hall"
            className="field"
            maxLength={120}
          />
        </div>
        <button type="submit" disabled={saving || !name.trim()} className="btn btn-md btn-primary">
          {saving ? 'Adding...' : 'Add venue'}
        </button>
      </form>

      {(data?.venues ?? []).length === 0 ? (
        <EmptyState title="No venues yet." body="Add the places events normally happen." compact />
      ) : (
        <ul className="card divide-y divide-hairline">
          {(data?.venues ?? []).map((venue) => (
            <li key={venue.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{venue.name}</span>
              <button
                type="button"
                onClick={() => setRemoving({ id: venue.id, name: venue.name })}
                className="btn btn-sm btn-ghost text-2xs hover:text-error"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={removing !== null}
        title="Remove this venue?"
        message={`"${removing?.name ?? ''}" will no longer be suggested. Events already at this location keep it.`}
        confirmLabel="Remove"
        busy={busy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

/** Exactly two Staff Admin places, enforced by the server (spec 2). */
function AdministratorsTab() {
  const { notify } = useToast();
  const { data, error, loading, reload } = useQuery<{
    users: AdminUser[];
    staff_admin_slots: { used: number; total: number };
  }>('/admin/users', { staleMs: 0 });

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setSaving(true);
    setFieldErrors({});
    try {
      await api('/admin/users', { method: 'POST', body: form });
      setForm({ name: '', email: '', password: '' });
      setAdding(false);
      reload();
      notify('Staff Admin added.');
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 400) {
        setFieldErrors(cause.fieldErrors);
        notify(cause.message, 'error');
      } else {
        notify(cause instanceof ApiError ? cause.message : 'We could not add that account.', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (user: AdminUser, active: boolean) => {
    try {
      await api(`/admin/users/${user.id}`, { method: 'PATCH', body: { active } });
      reload();
      notify(active ? `${user.name} reactivated.` : `${user.name} deactivated.`);
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'We could not update that account.', 'error');
    }
  };

  const deactivate = async () => {
    if (!deactivating) return;
    setBusy(true);
    try {
      await api(`/admin/users/${deactivating.id}`, { method: 'DELETE' });
      setDeactivating(null);
      reload();
      notify('Account deactivated and signed out everywhere.');
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'We could not update that account.', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorNotice message={error.message} onRetry={reload} />;
  if (loading && !data) return <SkeletonRows rows={3} />;

  const slots = data?.staff_admin_slots ?? { used: 0, total: 2 };
  const full = slots.used >= slots.total;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {slots.used} of {slots.total} Staff Admin places in use.
        </p>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={full}
            title={full ? 'Deactivate a Staff Admin to free a place.' : undefined}
            className="btn btn-sm btn-primary"
          >
            + Add Staff Admin
          </button>
        )}
      </div>

      {adding && (
        <form
          className="card space-y-3 p-3.5 animate-slide-up"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            void create();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="staff-name">
                Name
              </label>
              <input
                id="staff-name"
                autoFocus
                value={form.name}
                onChange={(changeEvent) => setForm({ ...form, name: changeEvent.target.value })}
                className="field"
                required
                maxLength={120}
              />
              <FieldError message={fieldErrors.name} />
            </div>
            <div>
              <label className="field-label" htmlFor="staff-email">
                Email
              </label>
              <input
                id="staff-email"
                type="email"
                value={form.email}
                onChange={(changeEvent) => setForm({ ...form, email: changeEvent.target.value })}
                className="field"
                required
                maxLength={200}
              />
              <FieldError message={fieldErrors.email} />
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="staff-password">
              Temporary password
            </label>
            <input
              id="staff-password"
              type="text"
              value={form.password}
              onChange={(changeEvent) => setForm({ ...form, password: changeEvent.target.value })}
              className="field"
              required
              minLength={10}
              maxLength={300}
            />
            <FieldError message={fieldErrors.password} />
            <p className="mt-1 text-2xs text-muted">
              At least 10 characters. Ask them to change it after their first sign-in.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn btn-md btn-primary">
              {saving ? 'Adding...' : 'Add Staff Admin'}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="btn btn-md btn-outline">
              Cancel
            </button>
          </div>
        </form>
      )}

      <ul className="card divide-y divide-hairline">
        {(data?.users ?? []).map((user) => (
          <li key={user.id} className="flex flex-wrap items-center gap-3 px-3.5 py-3">
            <div className="min-w-0 flex-1">
              <p className={cn('truncate text-sm font-medium', user.active ? 'text-ink' : 'text-faint')}>
                {user.name}
              </p>
              <p className="truncate text-xs text-muted">{user.email}</p>
            </div>
            <Pill
              className={
                user.role === 'super_admin'
                  ? 'border-transparent bg-accent text-accent-ink'
                  : 'border-hairline bg-raised text-muted'
              }
            >
              {user.role === 'super_admin' ? 'Super Admin' : 'Staff Admin'}
            </Pill>
            {!user.active && <Pill className="border-hairline bg-raised text-faint">Inactive</Pill>}

            {user.role === 'staff_admin' &&
              (user.active ? (
                <button
                  type="button"
                  onClick={() => setDeactivating(user)}
                  className="btn btn-sm btn-ghost text-2xs hover:text-error"
                >
                  Deactivate
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setActive(user, true)}
                  disabled={full}
                  className="btn btn-sm btn-ghost text-2xs"
                >
                  Reactivate
                </button>
              ))}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={deactivating !== null}
        title="Deactivate this Staff Admin?"
        message={`${deactivating?.name ?? 'They'} will be signed out everywhere and will not be able to sign in. Their events and responsibilities are kept.`}
        confirmLabel="Deactivate"
        busy={busy}
        onConfirm={deactivate}
        onCancel={() => setDeactivating(null)}
      />
    </div>
  );
}

function ArchiveTab() {
  const { notify } = useToast();
  const { data, error, loading, reload } = useQuery<EventListResponse>('/admin/archive', { staleMs: 0 });

  const restore = async (id: number, title: string) => {
    try {
      await api(`/events/${id}/restore`, { method: 'POST' });
      invalidate('/events');
      invalidate('/overview');
      reload();
      notify(`"${title}" restored to the calendar.`);
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'We could not restore that event.', 'error');
    }
  };

  if (error) return <ErrorNotice message={error.message} onRetry={reload} />;
  if (loading && !data) return <SkeletonRows rows={3} />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Deleted events are archived rather than destroyed, so nothing important is lost.
      </p>

      {(data?.events ?? []).length === 0 ? (
        <EmptyState title="Nothing archived." body="Deleted events will appear here." compact />
      ) : (
        <ul className="card divide-y divide-hairline">
          {(data?.events ?? []).map((event) => (
            <li key={event.id} className="flex flex-wrap items-center gap-3 px-3.5 py-3">
              <div className="min-w-0 flex-1">
                <Link
                  to={`/events/${event.id}`}
                  className="block truncate text-sm font-medium text-ink hover:text-accent"
                >
                  {event.title}
                </Link>
                <p className="truncate text-xs text-muted">
                  {event.organizer_name} &middot; {formatMediumDate(event.event_date)}
                  {event.updated_at ? ` · archived ${formatTimestamp(event.updated_at)}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => restore(event.id, event.title)}
                className="btn btn-sm btn-outline"
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
