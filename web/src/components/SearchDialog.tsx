import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, query as buildQuery } from '../api/client';
import type { SearchResponse } from '../api/types';
import { cn } from '../lib/cn';
import { formatMediumDate, formatTimeRange } from '../lib/date';
import { eventPill } from '../lib/taxonomy';
import { useAuth } from '../state/AuthContext';
import { Modal } from './Modal';
import { Pill, Spinner } from './ui';

/**
 * One global search across events, responsibilities, organisers and - for a
 * signed-in admin - their own private Quick Notes (spec 19).
 */
export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setTerm('');
      setResults(null);
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trimmed = term.trim();
    if (trimmed.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    // Debounced so typing does not fire a request per keystroke.
    const timer = window.setTimeout(() => {
      api<SearchResponse>(`/search${buildQuery({ q: trimmed })}`, { signal: controller.signal })
        .then(setResults)
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [term, open]);

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  const total =
    (results?.events.length ?? 0) +
    (results?.responsibilities.length ?? 0) +
    (results?.organizations.length ?? 0) +
    (results?.notes.length ?? 0);

  return (
    <Modal open={open} onClose={onClose} title="Search the calendar" size="lg">
      <div className="space-y-4">
        <div className="relative">
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
          >
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            autoFocus
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Events, clubs, venues, responsibilities..."
            className="field pl-9"
            aria-label="Search"
          />
        </div>

        {term.trim().length > 0 && term.trim().length < 2 && (
          <p className="text-sm text-muted">Keep typing to search.</p>
        )}

        {loading && (
          <div className="py-2">
            <Spinner label="Searching" />
          </div>
        )}

        {!loading && results && total === 0 && (
          <p className="py-4 text-center text-sm text-muted">
            Nothing matched &ldquo;{results.query}&rdquo;.
          </p>
        )}

        {results && results.events.length > 0 && (
          <Group title="Events">
            {results.events.map((event) => (
              <Row
                key={event.id}
                onSelect={() => go(`/events/${event.id}`)}
                title={event.title}
                meta={`${formatMediumDate(event.event_date)} · ${formatTimeRange(
                  event.start_time,
                  event.end_time,
                  event.all_day
                )}${event.location ? ` · ${event.location}` : ''}`}
                badge={<Pill className={eventPill(event)}>{event.organizer_name}</Pill>}
              />
            ))}
          </Group>
        )}

        {results && results.responsibilities.length > 0 && (
          <Group title="Responsibilities">
            {results.responsibilities.map((responsibility) => (
              <Row
                key={responsibility.id}
                onSelect={() => go(`/events/${responsibility.event_id}`)}
                title={responsibility.title}
                meta={`${responsibility.event_title} · ${formatMediumDate(responsibility.event_date)}${
                  responsibility.assigned_team ? ` · ${responsibility.assigned_team}` : ''
                }`}
                badge={
                  <Pill className="border-hairline bg-raised text-muted">
                    {responsibility.status === 'completed'
                      ? 'Done'
                      : responsibility.status === 'in_progress'
                        ? 'In progress'
                        : 'Open'}
                  </Pill>
                }
              />
            ))}
          </Group>
        )}

        {results && results.organizations.length > 0 && (
          <Group title="Clubs and departments">
            {results.organizations.map((organization) => (
              <Row
                key={organization.id}
                onSelect={() => go(`/events?organizer_id=${organization.id}`)}
                title={organization.name}
                meta="See every event from this organiser"
              />
            ))}
          </Group>
        )}

        {isAdmin && results && results.notes.length > 0 && (
          <Group title="Your quick notes">
            {results.notes.map((note) => (
              <Row
                key={note.id}
                onSelect={() => go('/admin/notes')}
                title={note.title || 'Untitled note'}
                meta={note.content.slice(0, 120)}
                badge={note.pinned ? <Pill className="border-hairline bg-raised text-muted">Pinned</Pill> : undefined}
              />
            ))}
          </Group>
        )}
      </div>
    </Modal>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="section-title mb-1.5">{title}</h3>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function Row({
  title,
  meta,
  badge,
  onSelect,
}: {
  title: string;
  meta?: string;
  badge?: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-raised'
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{title}</span>
        {meta && <span className="mt-0.5 block truncate text-xs text-muted">{meta}</span>}
      </span>
      {badge}
    </button>
  );
}
