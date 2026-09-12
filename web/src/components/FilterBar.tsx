import { useMemo } from 'react';
import type { MetaResponse } from '../api/types';
import { cn } from '../lib/cn';
import {
  EVENT_TYPE_FILTERS,
  SOURCE_FILTERS,
  STATUS_FILTERS,
} from '../lib/taxonomy';

export interface Filters {
  source: string;
  organizer_id: string;
  event_type: string;
  status: string;
  important: boolean;
}

export const emptyFilters: Filters = {
  source: '',
  organizer_id: '',
  event_type: '',
  status: '',
  important: false,
};

export function countActiveFilters(filters: Filters): number {
  return (
    (filters.source ? 1 : 0) +
    (filters.organizer_id ? 1 : 0) +
    (filters.event_type ? 1 : 0) +
    (filters.status ? 1 : 0) +
    (filters.important ? 1 : 0)
  );
}

/**
 * Filtering happens in place - the selects change state, the list re-renders,
 * nothing reloads (spec 20).
 */
export function FilterBar({
  filters,
  onChange,
  meta,
  className,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  meta?: MetaResponse;
  className?: string;
}) {
  const active = countActiveFilters(filters);

  // The club/organiser list narrows to the chosen source, so picking
  // "Clubs" then an organiser reads naturally.
  const organizers = useMemo(() => {
    const all = meta?.organizations ?? [];
    if (!filters.source) return all;
    return all.filter((organization) => organization.type === filters.source);
  }, [meta, filters.source]);

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    const next = { ...filters, [key]: value };
    // Changing source invalidates an organiser from a different source.
    if (key === 'source' && next.organizer_id) {
      const stillValid = (meta?.organizations ?? []).some(
        (organization) =>
          String(organization.id) === next.organizer_id &&
          (!value || organization.type === value)
      );
      if (!stillValid) next.organizer_id = '';
    }
    onChange(next);
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <Select
        label="Source"
        value={filters.source}
        onChange={(value) => set('source', value)}
        options={SOURCE_FILTERS}
      />

      <Select
        label="Organiser"
        value={filters.organizer_id}
        onChange={(value) => set('organizer_id', value)}
        options={[
          { value: '', label: 'All organisers' },
          ...organizers.map((organization) => ({
            value: String(organization.id),
            label: organization.name,
          })),
        ]}
      />

      <Select
        label="Type"
        value={filters.event_type}
        onChange={(value) => set('event_type', value)}
        options={EVENT_TYPE_FILTERS}
      />

      <Select
        label="Status"
        value={filters.status}
        onChange={(value) => set('status', value)}
        options={STATUS_FILTERS}
      />

      <button
        type="button"
        onClick={() => set('important', !filters.important)}
        aria-pressed={filters.important}
        className={cn(
          'btn btn-sm',
          filters.important ? 'btn-primary' : 'btn-outline'
        )}
      >
        Important only
      </button>

      {active > 0 && (
        <button type="button" onClick={() => onChange(emptyFilters)} className="btn btn-sm btn-ghost">
          Clear {active === 1 ? 'filter' : `${active} filters`}
        </button>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="relative inline-flex">
      {/* aria-label rather than a wrapping <label>: the label's accessible
          name would otherwise absorb every option's text. */}
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'h-8 appearance-none rounded-lg border bg-surface pl-2.5 pr-7 text-[0.8125rem] font-medium text-ink',
          'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25',
          value ? 'border-accent/50 bg-accent-wash text-accent' : 'border-edge'
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted"
      >
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    </div>
  );
}
