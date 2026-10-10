import { Link } from 'react-router-dom';
import type { CalendarEvent } from '../../api/types';
import { cn } from '../../lib/cn';
import { WEEKDAY_INITIAL, WEEKDAY_SHORT, formatDayNumber, monthGrid } from '../../lib/date';
import { eventAccent } from '../../lib/taxonomy';
import { formatTime } from '../../lib/date';
import { peekProps, useEventPeek } from '../EventPeek';
import { PlusIcon } from '../icons';

const MAX_VISIBLE = 3;

/**
 * The traditional grid. Each day shows compact event chips; anything beyond
 * three is summarised so a busy week never breaks the layout.
 */
export function MonthView({
  monthISO,
  eventsByDate,
  today,
  onSelectDay,
  onCreateAt,
}: {
  monthISO: string;
  eventsByDate: Map<string, CalendarEvent[]>;
  today: string;
  onSelectDay: (dateISO: string) => void;
  /** Admins only: clicking empty space in a day starts an event on that date. */
  onCreateAt?: (dateISO: string) => void;
}) {
  const weeks = monthGrid(monthISO, today);
  const peek = useEventPeek();

  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
      <div className="grid grid-cols-7 border-b border-hairline bg-raised/60">
        {WEEKDAY_SHORT.map((label, index) => (
          <div
            key={label}
            className="px-2 py-2 text-center text-2xs font-semibold uppercase tracking-wider text-muted"
          >
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden" aria-hidden="true">
              {WEEKDAY_INITIAL[index]}
            </span>
            <span className="sr-only sm:hidden">{label}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {weeks.flat().map((cell, index) => {
          const dayEvents = eventsByDate.get(cell.date) ?? [];
          const visible = dayEvents.slice(0, MAX_VISIBLE);
          const hidden = dayEvents.length - visible.length;

          return (
            <div
              key={cell.date}
              className={cn(
                'group/day relative flex min-h-[5.25rem] flex-col gap-1 border-b border-r border-hairline p-1.5 sm:min-h-[7rem]',
                index % 7 === 6 && 'border-r-0',
                index >= 35 && 'border-b-0',
                !cell.inMonth && 'bg-raised/40',
                cell.isWeekend && cell.inMonth && 'bg-canvas/40'
              )}
            >
              <div className="flex items-start justify-between">
                <button
                  type="button"
                  onClick={() => onSelectDay(cell.date)}
                  className={cn(
                    'grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors',
                    cell.isToday
                      ? 'bg-accent text-accent-ink'
                      : cell.inMonth
                        ? 'text-ink hover:bg-raised'
                        : 'text-faint hover:bg-raised'
                  )}
                  aria-label={`Open ${cell.date}`}
                >
                  {formatDayNumber(cell.date)}
                </button>

                {onCreateAt && (
                  <button
                    type="button"
                    onClick={() => onCreateAt(cell.date)}
                    title="New event on this day"
                    className="grid h-5 w-5 place-items-center rounded-md text-faint opacity-0 transition hover:bg-raised hover:text-ink focus-visible:opacity-100 group-hover/day:opacity-100"
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                    <span className="sr-only">New event on {cell.date}</span>
                  </button>
                )}
              </div>

              {visible.map((event) => (
                <Link
                  key={event.id}
                  to={`/events/${event.id}`}
                  {...peekProps(peek, event.id)}
                  title={`${event.title} - ${event.organizer_name}${
                    event.location ? ` - ${event.location}` : ''
                  }`}
                  className={cn(
                    'group relative z-[1] flex items-center gap-1 rounded-md px-1 py-[3px] text-left text-2xs leading-tight transition-colors hover:bg-raised',
                    event.status === 'cancelled' && 'opacity-60'
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn('h-1.5 w-1.5 shrink-0 rounded-full', eventAccent(event))}
                  />
                  {!event.all_day && event.start_time && (
                    <span className="shrink-0 tabular-nums text-faint">
                      {formatTime(event.start_time).replace(':00', '')}
                    </span>
                  )}
                  <span
                    className={cn(
                      'truncate text-ink group-hover:text-accent',
                      event.important && 'font-semibold'
                    )}
                  >
                    {event.title}
                  </span>
                </Link>
              ))}

              {hidden > 0 && (
                <button
                  type="button"
                  onClick={() => onSelectDay(cell.date)}
                  className="relative z-[1] rounded-md px-1 py-[3px] text-left text-2xs font-medium text-muted hover:bg-raised hover:text-accent"
                >
                  +{hidden} more
                </button>
              )}

              {/* The leftover space is the quickest way to add something here. */}
              {onCreateAt && (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  onClick={() => onCreateAt(cell.date)}
                  className="min-h-[0.75rem] flex-1 cursor-pointer rounded-md"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
