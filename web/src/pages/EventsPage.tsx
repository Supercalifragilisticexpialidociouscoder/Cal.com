import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { query as buildQuery } from '../api/client';
import type { EventListResponse, MetaResponse } from '../api/types';
import { useQuery } from '../api/useQuery';
import { useEventPeek } from '../components/EventPeek';
import { EventListRow } from '../components/EventListRow';
import { FilterBar, countActiveFilters, emptyFilters, type Filters } from '../components/FilterBar';
import { CalendarIcon, PlusIcon, SearchIcon } from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import { EmptyState, ErrorNotice, SkeletonRows, Spinner } from '../components/ui';
import { cn } from '../lib/cn';
import { addDays, todayISO } from '../lib/date';
import { useAuth } from '../state/AuthContext';

type Window = 'upcoming' | 'past' | 'all';

const PAGE_SIZE = 24;

/** The searchable, filterable list of every event (spec 20, 43). */
export function EventsPage() {
  const [params, setParams] = useSearchParams();
  const { isAdmin } = useAuth();
  const today = todayISO();

  const [search, setSearch] = useState(params.get('q') ?? '');
  const [debounced, setDebounced] = useState(search);
  const [window_, setWindow] = useState<Window>(
    params.get('window') === 'past' ? 'past' : params.get('window') === 'all' ? 'all' : 'upcoming'
  );
  const [filters, setFilters] = useState<Filters>(() => ({
    ...emptyFilters,
    source: params.get('source') ?? '',
    organizer_id: params.get('organizer_id') ?? '',
    event_type: params.get('event_type') ?? '',
    status: params.get('status') ?? '',
    important: params.get('important') === 'true',
  }));
  const [page, setPage] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [debounced, window_, filters]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (debounced) next.set('q', debounced);
    if (window_ !== 'upcoming') next.set('window', window_);
    if (filters.source) next.set('source', filters.source);
    if (filters.organizer_id) next.set('organizer_id', filters.organizer_id);
    if (filters.event_type) next.set('event_type', filters.event_type);
    if (filters.status) next.set('status', filters.status);
    if (filters.important) next.set('important', 'true');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, window_, filters]);

  const { data: meta } = useQuery<MetaResponse>('/meta', { staleMs: 300_000 });
  const openEvent = useEventPeek();

  const range = useMemo(() => {
    if (window_ === 'upcoming') return { from: today, to: undefined };
    if (window_ === 'past') return { from: undefined, to: addDays(today, -1) };
    return { from: undefined, to: undefined };
  }, [window_, today]);

  const path = `/events${buildQuery({
    q: debounced,
    from: range.from,
    to: range.to,
    source: filters.source,
    organizer_id: filters.organizer_id,
    event_type: filters.event_type,
    status: filters.status,
    important: filters.important,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  })}`;

  const { data, error, loading, refreshing, reload } = useQuery<EventListResponse>(path, {
    staleMs: isAdmin ? 5_000 : 30_000,
  });

  const activeFilterCount = countActiveFilters(filters);
  const total = data?.page.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <PageHeader
        className="mb-0"
        title="Events"
        description="Every Infin8 activity - institutional, academic, department and club."
        actions={
          isAdmin ? (
            <Link to="/admin/events/new" className="btn btn-md btn-primary">
              <PlusIcon className="h-4 w-4" />
              New event
            </Link>
          ) : undefined
        }
      />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search events, venues and organisers"
              className="field pl-9"
              aria-label="Search events"
            />
          </div>

          <div role="tablist" aria-label="Time range" className="flex rounded-lg border border-hairline bg-raised p-0.5">
            {(['upcoming', 'past', 'all'] as Window[]).map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={window_ === option}
                onClick={() => setWindow(option)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[0.8125rem] font-medium capitalize transition',
                  window_ === option
                    ? 'bg-surface text-ink shadow-card'
                    : 'text-muted hover:text-ink'
                )}
              >
                {option}
              </button>
            ))}
          </div>

          {refreshing && <Spinner label="Refreshing" />}
        </div>

        <FilterBar filters={filters} onChange={setFilters} meta={meta} />
      </div>

      {error && <ErrorNotice message={error.message} onRetry={reload} />}

      {loading && !data ? (
        <SkeletonRows rows={6} />
      ) : data && data.events.length > 0 ? (
        <>
          <p className="text-xs text-muted">
            {total} {total === 1 ? 'event' : 'events'}
            {debounced && ` matching "${debounced}"`}
          </p>
          <ul className="animate-fade-in divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface">
            {data.events.map((event) => (
              <EventListRow key={event.id} event={event} open={openEvent} isAdmin={isAdmin} />
            ))}
          </ul>

          {pageCount > 1 && (
            <nav className="flex items-center justify-between gap-3 pt-2" aria-label="Pagination">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(0, value - 1))}
                disabled={page === 0}
                className="btn btn-sm btn-outline"
              >
                Previous
              </button>
              <span className="text-xs text-muted">
                Page {page + 1} of {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((value) => value + 1)}
                disabled={!data.page.has_more}
                className="btn btn-sm btn-outline"
              >
                Next
              </button>
            </nav>
          )}
        </>
      ) : (
        <EmptyState
          icon={debounced ? SearchIcon : CalendarIcon}
          title={debounced ? `Nothing matched "${debounced}".` : 'No events to show.'}
          body={
            activeFilterCount > 0 || debounced
              ? 'Try a different search, or clear the filters.'
              : window_ === 'upcoming'
                ? 'Nothing is scheduled yet. Check the past events, or open the calendar.'
                : 'There is nothing in this range.'
          }
          action={
            activeFilterCount > 0 || debounced ? (
              <button
                type="button"
                onClick={() => {
                  setFilters(emptyFilters);
                  setSearch('');
                }}
                className="btn btn-sm btn-outline"
              >
                Clear search and filters
              </button>
            ) : (
              <Link to="/calendar" className="btn btn-sm btn-outline">
                Open calendar
              </Link>
            )
          }
        />
      )}
    </div>
  );
}
