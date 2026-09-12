import { Link } from 'react-router-dom';
import type { CalendarEvent } from '../../api/types';
import { cn } from '../../lib/cn';
import {
  WEEKDAY_SHORT,
  formatDayNumber,
  formatTime,
  minutesFromTime,
  parseISO,
  weekDates,
} from '../../lib/date';
import { eventAccent } from '../../lib/taxonomy';

const ROW_HEIGHT = 48;
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 20;

interface Positioned {
  event: CalendarEvent;
  top: number;
  height: number;
  column: number;
  columns: number;
}

/** Lays out overlapping events side by side within a day column. */
function layoutDay(events: CalendarEvent[], startHour: number): Positioned[] {
  const timed = events
    .filter((event) => !event.all_day && event.start_time)
    .map((event) => {
      const start = minutesFromTime(event.start_time as string);
      const end = event.end_time ? minutesFromTime(event.end_time) : start + 60;
      return { event, start, end: Math.max(end, start + 30) };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const positioned: Positioned[] = [];
  let cluster: typeof timed = [];

  const flush = () => {
    if (cluster.length === 0) return;
    // Greedy column packing: each event takes the first column it fits in.
    const columnEnds: number[] = [];
    const assignments = cluster.map((item) => {
      let column = columnEnds.findIndex((end) => end <= item.start);
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(item.end);
      } else {
        columnEnds[column] = item.end;
      }
      return { item, column };
    });

    for (const { item, column } of assignments) {
      positioned.push({
        event: item.event,
        top: ((item.start - startHour * 60) / 60) * ROW_HEIGHT,
        height: Math.max(((item.end - item.start) / 60) * ROW_HEIGHT - 2, 20),
        column,
        columns: columnEnds.length,
      });
    }
    cluster = [];
  };

  let clusterEnd = -1;
  for (const item of timed) {
    if (cluster.length > 0 && item.start >= clusterEnd) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();

  return positioned;
}

export function WeekView({
  anchorISO,
  eventsByDate,
  today,
  onSelectDay,
}: {
  anchorISO: string;
  eventsByDate: Map<string, CalendarEvent[]>;
  today: string;
  onSelectDay: (dateISO: string) => void;
}) {
  const days = weekDates(anchorISO);
  const weekEvents = days.flatMap((date) => eventsByDate.get(date) ?? []);

  // Widen the visible hours only as far as the week's events require.
  const timedMinutes = weekEvents
    .filter((event) => !event.all_day && event.start_time)
    .flatMap((event) => [
      minutesFromTime(event.start_time as string),
      event.end_time ? minutesFromTime(event.end_time) : minutesFromTime(event.start_time as string) + 60,
    ]);

  const startHour = Math.min(
    DEFAULT_START_HOUR,
    timedMinutes.length > 0 ? Math.floor(Math.min(...timedMinutes) / 60) : DEFAULT_START_HOUR
  );
  const endHour = Math.max(
    DEFAULT_END_HOUR,
    timedMinutes.length > 0 ? Math.ceil(Math.max(...timedMinutes) / 60) : DEFAULT_END_HOUR
  );
  const hours = Array.from({ length: Math.max(endHour - startHour, 1) }, (_, i) => startHour + i);

  const allDayByDay = days.map((date) =>
    (eventsByDate.get(date) ?? []).filter((event) => event.all_day || !event.start_time)
  );
  const hasAllDay = allDayByDay.some((list) => list.length > 0);

  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
      <div className="grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))] border-b border-hairline bg-raised/60">
        <div aria-hidden="true" />
        {days.map((date) => {
          const parsed = parseISO(date);
          const isToday = date === today;
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelectDay(date)}
              className="flex flex-col items-center gap-0.5 px-1 py-2 transition-colors hover:bg-raised"
            >
              <span className="text-2xs font-semibold uppercase tracking-wider text-muted">
                {WEEKDAY_SHORT[parsed.getDay()]}
              </span>
              <span
                className={cn(
                  'grid h-6 w-6 place-items-center rounded-full text-xs font-semibold',
                  isToday ? 'bg-accent text-accent-ink' : 'text-ink'
                )}
              >
                {formatDayNumber(date)}
              </span>
            </button>
          );
        })}
      </div>

      {hasAllDay && (
        <div className="grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))] border-b border-hairline">
          <div className="px-2 py-1.5 text-right text-2xs font-medium text-faint">All day</div>
          {allDayByDay.map((list, index) => (
            <div key={days[index]} className="space-y-1 border-l border-hairline p-1">
              {list.map((event) => (
                <Link
                  key={event.id}
                  to={`/events/${event.id}`}
                  className="flex items-center gap-1 rounded-md bg-raised px-1.5 py-1 text-2xs text-ink transition-colors hover:bg-accent-wash hover:text-accent"
                  title={event.title}
                >
                  <span
                    aria-hidden="true"
                    className={cn('h-1.5 w-1.5 shrink-0 rounded-full', eventAccent(event))}
                  />
                  <span className="truncate">{event.title}</span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="scroll-slim max-h-[34rem] overflow-y-auto">
        <div className="relative grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))]">
          <div className="relative">
            {hours.map((hour) => (
              <div
                key={hour}
                style={{ height: ROW_HEIGHT }}
                className="relative -top-2 pr-2 text-right text-2xs tabular-nums text-faint"
              >
                {formatTime(`${String(hour).padStart(2, '0')}:00`).replace(':00', '')}
              </div>
            ))}
          </div>

          {days.map((date) => {
            const positioned = layoutDay(eventsByDate.get(date) ?? [], startHour);
            return (
              <div key={date} className="relative border-l border-hairline">
                {hours.map((hour) => (
                  <div
                    key={hour}
                    style={{ height: ROW_HEIGHT }}
                    className={cn('border-b border-hairline/70', date === today && 'bg-accent-wash/25')}
                  />
                ))}

                {positioned.map(({ event, top, height, column, columns }) => (
                  <Link
                    key={event.id}
                    to={`/events/${event.id}`}
                    title={`${event.title} - ${event.organizer_name}`}
                    style={{
                      top,
                      height,
                      left: `calc(${(column / columns) * 100}% + 2px)`,
                      width: `calc(${100 / columns}% - 4px)`,
                    }}
                    className={cn(
                      'absolute overflow-hidden rounded-md border-l-2 bg-surface px-1.5 py-1 text-2xs shadow-card transition-shadow hover:z-10 hover:shadow-raised',
                      'border-hairline',
                      event.status === 'cancelled' && 'opacity-60 line-through'
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn('absolute inset-y-0 left-0 w-[2px]', eventAccent(event))}
                    />
                    <span className="block truncate font-semibold text-ink">{event.title}</span>
                    <span className="block truncate text-faint">
                      {event.start_time ? formatTime(event.start_time) : ''}
                      {event.location ? ` - ${event.location}` : ''}
                    </span>
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
