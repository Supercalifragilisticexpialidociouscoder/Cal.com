import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, query as buildQuery } from '../api/client';
import type { SearchResponse } from '../api/types';
import { cn } from '../lib/cn';
import { formatMediumDate, formatTimeRange, todayISO } from '../lib/date';
import { eventPill } from '../lib/taxonomy';
import { useAuth } from '../state/AuthContext';
import { useTheme } from '../state/ThemeContext';
import {
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  HomeIcon,
  ListIcon,
  MoonIcon,
  NoteIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
} from './icons';
import { Pill } from './ui';

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  Icon: typeof HomeIcon;
  run: () => void;
  keywords?: string;
}

/**
 * One box that both searches and acts.
 *
 * A palette that only finds things makes you leave it to do anything; this one
 * navigates, creates, switches calendar view and flips the theme, with search
 * results folded in beneath. Cmd/Ctrl+K anywhere, or "/" when not typing.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { isAdmin, isSuperAdmin } = useAuth();
  const { setMode } = useTheme();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setTerm('');
      setResults(null);
      setActive(0);
      // Focus after paint so the dialog is mounted.
      window.setTimeout(() => inputRef.current?.focus(), 0);
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
    const timer = window.setTimeout(() => {
      api<SearchResponse>(`/search${buildQuery({ q: trimmed })}`, { signal: controller.signal })
        .then(setResults)
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [term, open]);

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  const commands = useMemo<Command[]>(() => {
    const base: Command[] = [
      { id: 'go-overview', label: 'Overview', group: 'Go to', Icon: HomeIcon, run: () => go(isAdmin ? '/admin' : '/') },
      { id: 'go-calendar', label: 'Calendar', group: 'Go to', Icon: CalendarIcon, run: () => go('/calendar') },
      { id: 'go-events', label: 'All events', group: 'Go to', Icon: ListIcon, run: () => go('/events') },
      { id: 'go-upcoming', label: 'Upcoming', group: 'Go to', Icon: ClockIcon, run: () => go('/upcoming') },
      {
        id: 'view-month',
        label: 'Month view',
        group: 'Calendar',
        Icon: CalendarIcon,
        keywords: 'grid',
        run: () => go('/calendar?view=month'),
      },
      { id: 'view-week', label: 'Week view', group: 'Calendar', Icon: CalendarIcon, run: () => go('/calendar?view=week') },
      { id: 'view-day', label: 'Day view', group: 'Calendar', Icon: CalendarIcon, run: () => go('/calendar?view=day') },
      { id: 'view-agenda', label: 'Agenda view', group: 'Calendar', Icon: ListIcon, run: () => go('/calendar?view=agenda') },
      {
        id: 'jump-today',
        label: 'Jump to today',
        group: 'Calendar',
        Icon: CalendarIcon,
        keywords: 'now',
        run: () => go(`/calendar?view=day&date=${todayISO()}`),
      },
      {
        id: 'filter-deadlines',
        label: 'Show deadlines only',
        group: 'Calendar',
        Icon: ClockIcon,
        run: () => go('/events?event_type=deadline'),
      },
      { id: 'theme-light', label: 'Light theme', group: 'Appearance', Icon: SunIcon, run: () => { setMode('light'); onClose(); } },
      { id: 'theme-dark', label: 'Dark theme', group: 'Appearance', Icon: MoonIcon, run: () => { setMode('dark'); onClose(); } },
    ];

    if (isAdmin) {
      base.unshift({
        id: 'new-event',
        label: 'Create event',
        hint: 'C',
        group: 'Actions',
        Icon: PlusIcon,
        keywords: 'add new',
        run: () => go('/admin/events/new'),
      });
      base.push(
        { id: 'go-tasks', label: 'My tasks', group: 'Go to', Icon: CheckCircleIcon, run: () => go('/admin/tasks') },
        { id: 'go-notes', label: 'Quick notes', group: 'Go to', Icon: NoteIcon, run: () => go('/admin/notes') },
        { id: 'go-manage', label: 'Administration', group: 'Go to', Icon: SettingsIcon, run: () => go('/admin/manage') }
      );
    }
    if (isSuperAdmin) {
      base.push({
        id: 'go-admins',
        label: 'Manage administrators',
        group: 'Go to',
        Icon: SettingsIcon,
        run: () => go('/admin/manage'),
      });
    }
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, isSuperAdmin]);

  const filteredCommands = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((command) =>
      `${command.label} ${command.group} ${command.keywords ?? ''}`.toLowerCase().includes(q)
    );
  }, [commands, term]);

  // One flat list of everything selectable, so the arrow keys cross groups.
  const rows = useMemo(() => {
    const entries: Array<{ key: string; run: () => void }> = filteredCommands.map((command) => ({
      key: command.id,
      run: command.run,
    }));
    for (const event of results?.events ?? []) {
      entries.push({ key: `event-${event.id}`, run: () => go(`/events/${event.id}`) });
    }
    for (const note of results?.notes ?? []) {
      entries.push({ key: `note-${note.id}`, run: () => go('/admin/notes') });
    }
    return entries;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredCommands, results]);

  useEffect(() => {
    setActive(0);
  }, [term, results]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActive((index) => Math.min(index + 1, Math.max(rows.length - 1, 0)));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive((index) => Math.max(index - 1, 0));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        rows[active]?.run();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, rows, active, onClose]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const grouped = filteredCommands.reduce<Record<string, Command[]>>((acc, command) => {
    (acc[command.group] ??= []).push(command);
    return acc;
  }, {});

  let cursor = -1;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-xl overflow-hidden rounded-xl border border-hairline bg-surface shadow-overlay animate-scale-in"
      >
        <div className="flex items-center gap-2.5 border-b border-hairline px-3.5">
          <SearchIcon className="h-4 w-4 shrink-0 text-faint" />
          <input
            ref={inputRef}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search events, or type a command..."
            aria-label="Search or run a command"
            role="combobox"
            aria-expanded={rows.length > 0}
            aria-controls="command-palette-list"
            aria-autocomplete="list"
            aria-activedescendant={rows.length > 0 ? `command-row-${active}` : undefined}
            className="h-12 flex-1 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
          />
          {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-edge border-t-accent" />}
          <kbd className="rounded border border-hairline bg-raised px-1.5 py-0.5 text-2xs text-faint">esc</kbd>
        </div>

        <div
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          aria-label="Results"
          className="scroll-slim max-h-[22rem] overflow-y-auto p-1.5"
        >
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} role="group" aria-label={group} className="mb-1">
              <p className="px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-faint">{group}</p>
              {items.map((command) => {
                cursor += 1;
                const index = cursor;
                return (
                  <button
                    key={command.id}
                    type="button"
                    id={`command-row-${index}`}
                    role="option"
                    aria-selected={index === active}
                    data-active={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={command.run}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
                      index === active ? 'bg-raised text-ink' : 'text-muted'
                    )}
                  >
                    <command.Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">{command.label}</span>
                    {command.hint && (
                      <kbd className="rounded border border-hairline bg-raised px-1 text-2xs text-faint">
                        {command.hint}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          {results && results.events.length > 0 && (
            <div role="group" aria-label="Events" className="mb-1">
              <p className="px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-faint">Events</p>
              {results.events.map((event) => {
                cursor += 1;
                const index = cursor;
                return (
                  <button
                    key={event.id}
                    type="button"
                    id={`command-row-${index}`}
                    role="option"
                    aria-selected={index === active}
                    data-active={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => go(`/events/${event.id}`)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
                      index === active ? 'bg-raised' : ''
                    )}
                  >
                    <CalendarIcon className="h-4 w-4 shrink-0 text-faint" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{event.title}</span>
                      <span className="block truncate text-2xs text-muted">
                        {formatMediumDate(event.event_date)} &middot;{' '}
                        {formatTimeRange(event.start_time, event.end_time, event.all_day)}
                      </span>
                    </span>
                    <Pill className={eventPill(event)}>{event.organizer_name}</Pill>
                  </button>
                );
              })}
            </div>
          )}

          {isAdmin && results && results.notes.length > 0 && (
            <div role="group" aria-label="Your notes" className="mb-1">
              <p className="px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-faint">Your notes</p>
              {results.notes.map((note) => {
                cursor += 1;
                const index = cursor;
                return (
                  <button
                    key={note.id}
                    type="button"
                    id={`command-row-${index}`}
                    role="option"
                    aria-selected={index === active}
                    data-active={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => go('/admin/notes')}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
                      index === active ? 'bg-raised' : ''
                    )}
                  >
                    <NoteIcon className="h-4 w-4 shrink-0 text-faint" />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">
                      {note.title || 'Untitled note'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {rows.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted">
              Nothing matched &ldquo;{term}&rdquo;.
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-hairline bg-raised/40 px-3.5 py-2 text-2xs text-faint">
          <span>
            <kbd className="rounded border border-hairline bg-surface px-1">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="rounded border border-hairline bg-surface px-1">↵</kbd> select
          </span>
        </div>
      </div>
    </div>
  );
}
