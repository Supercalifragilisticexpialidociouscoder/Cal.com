import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { query as buildQuery } from '../api/client';
import type { CalendarEvent, EventListResponse, MetaResponse } from '../api/types';
import { useQuery } from '../api/useQuery';
import { AgendaView } from '../components/calendar/AgendaView';
import { DayView } from '../components/calendar/DayView';
import { MonthView } from '../components/calendar/MonthView';
import { WeekView } from '../components/calendar/WeekView';
import { FilterBar, countActiveFilters, emptyFilters, type Filters } from '../components/FilterBar';
import { ErrorNotice, SkeletonRows, Spinner } from '../components/ui';
import { cn } from '../lib/cn';
import {
  addDays,
  addMonths,
  formatFullDate,
  formatMonthTitle,
  formatWeekTitle,
  startOfMonth,
  startOfWeek,
  todayISO,
} from '../lib/date';
import { useAuth } from '../state/AuthContext';

type ViewMode = 'month' | 'week' | 'day' | 'agenda';

const VIEWS: Array<{ value: ViewMode; label: string }> = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'day', label: 'Day' },
  { value: 'agenda', label: 'Agenda' },
];

function isViewMode(value: string | null): value is ViewMode {
  return value === 'month' || value === 'week' || value === 'day' || value === 'agenda';
}

/** Phones get Agenda by default: a dense month grid is hard to use there (spec 5). */
function defaultView(): ViewMode {
  if (typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches) {
    return 'agenda';
  }
  return 'month';
}

export function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const { isAdmin } = useAuth();
  const today = todayISO();

  const [view, setView] = useState<ViewMode>(() =>
    isViewMode(params.get('view')) ? (params.get('view') as ViewMode) : defaultView()
  );
  const [anchor, setAnchor] = useState<string>(() => params.get('date') ?? today);
  const [filters, setFilters] = useState<Filters>(() => ({
    ...emptyFilters,
    source: params.get('source') ?? '',
    organizer_id: params.get('organizer_id') ?? '',
    event_type: params.get('event_type') ?? '',
    status: params.get('status') ?? '',
    important: params.get('important') === 'true',
  }));
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Keep the URL shareable without making it the source of truth.
  useEffect(() => {
    const next = new URLSearchParams();
    next.set('view', view);
    if (anchor !== today) next.set('date', anchor);
    if (filters.source) next.set('source', filters.source);
    if (filters.organizer_id) next.set('organizer_id', filters.organizer_id);
    if (filters.event_type) next.set('event_type', filters.event_type);
    if (filters.status) next.set('status', filters.status);
    if (filters.important) next.set('important', 'true');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, anchor, filters]);

  const { data: meta } = useQuery<MetaResponse>('/meta', { staleMs: 300_000 });

  // The fetched window covers the visible range plus padding, so stepping to
  // the next month usually renders straight from cache.
  const range = useMemo(() => {
    if (view === 'day') return { from: addDays(anchor, -1), to: addDays(anchor, 1) };
    if (view === 'week') {
      const start = startOfWeek(anchor);
      return { from: start, to: addDays(start, 6) };
    }
    if (view === 'agenda') return { from: anchor < today ? anchor : today, to: addDays(anchor, 120) };
    const monthStart = startOfMonth(anchor);
    return { from: addDays(monthStart, -7), to: addDays(addMonths(monthStart, 1), 7) };
  }, [view, anchor, today]);

  const path = `/events${buildQuery({
    from: range.from,
    to: range.to,
    source: filters.source,
    organizer_id: filters.organizer_id,
    event_type: filters.event_type,
    status: filters.status,
    important: filters.important,
    limit: 200,
  })}`;

  const { data, error, loading, refreshing, reload } = useQuery<EventListResponse>(path, {
    staleMs: isAdmin ? 5_000 : 30_000,
  });

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of data?.events ?? []) {
      const bucket = map.get(event.event_date);
      if (bucket) bucket.push(event);
      else map.set(event.event_date, [event]);
    }
    return map;
  }, [data]);

  const title =
    view === 'month'
      ? formatMonthTitle(anchor)
      : view === 'week'
        ? formatWeekTitle(anchor)
        : view === 'day'
          ? formatFullDate(anchor)
          : 'Agenda';

  const step = (direction: -1 | 1) => {
    if (view === 'month') setAnchor(addMonths(anchor, direction));
    else if (view === 'week') setAnchor(addDays(anchor, direction * 7));
    else if (view === 'day') setAnchor(addDays(anchor, direction));
    else setAnchor(addDays(anchor, direction * 30));
  };

  const openDay = (dateISO: string) => {
    setAnchor(dateISO);
    setView('day');
  };

  const activeFilterCount = countActiveFilters(filters);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => step(-1)}
            className="btn btn-sm btn-outline px-2"
            aria-label="Previous"
          >
            <Chevron direction="left" />
          </button>
          <button type="button" onClick={() => setAnchor(today)} className="btn btn-sm btn-outline">
            Today
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            className="btn btn-sm btn-outline px-2"
            aria-label="Next"
          >
            <Chevron direction="right" />
          </button>
        </div>

        <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-ink sm:text-lg" aria-live="polite">
          {title}
        </h1>

        {refreshing && <Spinner label="Refreshing" />}

        <div
          role="tablist"
          aria-label="Calendar view"
          className="flex rounded-lg border border-hairline bg-raised p-0.5"
        >
          {VIEWS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={view === option.value}
              onClick={() => setView(option.value)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[0.8125rem] font-medium transition',
                view === option.value
                  ? 'bg-surface text-ink shadow-card'
                  : 'text-muted hover:text-ink'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          className={cn('btn btn-sm', activeFilterCount > 0 ? 'btn-primary' : 'btn-outline')}
        >
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-0.5 rounded-full bg-accent-ink/20 px-1.5 text-2xs">
              {activeFilterCount}
            </span>
          )}
        </button>

        {isAdmin && (
          <Link to="/admin/events/new" className="btn btn-sm btn-primary">
            + Create Event
          </Link>
        )}
      </header>

      {filtersOpen && (
        <div className="card animate-slide-up p-3">
          <FilterBar filters={filters} onChange={setFilters} meta={meta} />
        </div>
      )}

      {error && <ErrorNotice message={error.message} onRetry={reload} />}

      {loading && !data ? (
        <SkeletonRows rows={6} />
      ) : (
        <div className="animate-fade-in">
          {view === 'month' && (
            <MonthView
              monthISO={anchor}
              eventsByDate={eventsByDate}
              today={today}
              onSelectDay={openDay}
            />
          )}
          {view === 'week' && (
            <WeekView anchorISO={anchor} eventsByDate={eventsByDate} today={today} onSelectDay={openDay} />
          )}
          {view === 'day' && (
            <DayView
              dateISO={anchor}
              events={eventsByDate.get(anchor) ?? []}
              today={today}
              onViewUpcoming={() => setView('agenda')}
            />
          )}
          {view === 'agenda' && (
            <AgendaView
              events={(data?.events ?? []).filter((event) => event.event_date >= range.from)}
              today={today}
              emptyTitle="No events in this range."
              emptyBody={
                activeFilterCount > 0
                  ? 'Try clearing the filters to see everything on the calendar.'
                  : 'Nothing is scheduled over the next few months.'
              }
              emptyAction={
                activeFilterCount > 0 ? (
                  <button type="button" onClick={() => setFilters(emptyFilters)} className="btn btn-sm btn-outline">
                    Clear filters
                  </button>
                ) : undefined
              }
            />
          )}
        </div>
      )}

      <Legend />
    </div>
  );
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M10 3L5 8l5 5' : 'M6 3l5 5-5 5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Colour is only useful if it is explained once. */
function Legend() {
  const items = [
    { label: 'MRTC', className: 'bg-src-institution' },
    { label: 'Department', className: 'bg-src-department' },
    { label: 'Academic', className: 'bg-src-academic' },
    { label: 'Club', className: 'bg-src-club' },
    { label: 'Deadline', className: 'bg-attention' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-2xs text-muted">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', item.className)} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
