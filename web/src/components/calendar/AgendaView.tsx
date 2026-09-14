import type { CalendarEvent } from '../../api/types';
import { cn } from '../../lib/cn';
import { formatFullDate, formatRelativeDay, todayISO } from '../../lib/date';
import { EventCard } from '../EventCard';
import { EmptyState } from '../ui';

/** A chronological list, grouped by day. The default on small screens. */
export function AgendaView({
  events,
  today = todayISO(),
  emptyTitle = 'No events in this range.',
  emptyBody = 'Try a different month, or clear the filters to see everything.',
  emptyAction,
}: {
  events: CalendarEvent[];
  today?: string;
  emptyTitle?: string;
  emptyBody?: string;
  emptyAction?: React.ReactNode;
}) {
  if (events.length === 0) {
    return <EmptyState title={emptyTitle} body={emptyBody} action={emptyAction} />;
  }

  const groups = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const bucket = groups.get(event.event_date);
    if (bucket) bucket.push(event);
    else groups.set(event.event_date, [event]);
  }

  return (
    <div className="space-y-5">
      {[...groups.entries()].map(([date, dayEvents]) => {
        const isToday = date === today;
        return (
          <section key={date}>
            <div className="sticky top-[3.5rem] z-10 -mx-1 mb-2 flex items-baseline gap-2 bg-canvas/95 px-1 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-canvas/80">
              <h3
                className={cn(
                  'text-2xs font-semibold uppercase tracking-[0.09em]',
                  isToday ? 'text-accent' : 'text-faint'
                )}
              >
                {formatRelativeDay(date, today)}
              </h3>
              <span className="text-2xs text-faint">{formatFullDate(date)}</span>
            </div>
            <div className="space-y-2">
              {dayEvents.map((event) => (
                <EventCard key={event.id} event={event} showDate={false} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
