import type { CalendarEvent } from '../../api/types';
import { formatFullDate, formatRelativeDay } from '../../lib/date';
import { EventCard } from '../EventCard';
import { EmptyState } from '../ui';

/** A single day, read top to bottom. The most useful view on a phone. */
export function DayView({
  dateISO,
  events,
  today,
  onViewUpcoming,
}: {
  dateISO: string;
  events: CalendarEvent[];
  today: string;
  onViewUpcoming: () => void;
}) {
  const allDay = events.filter((event) => event.all_day || !event.start_time);
  const timed = events.filter((event) => !event.all_day && event.start_time);

  return (
    <div className="rounded-xl border border-hairline bg-surface p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline pb-3">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wider text-accent">
            {formatRelativeDay(dateISO, today)}
          </p>
          <h2 className="mt-0.5 text-lg font-semibold text-ink">{formatFullDate(dateISO)}</h2>
        </div>
        <p className="text-sm text-muted">
          {events.length === 0
            ? 'Nothing scheduled'
            : `${events.length} ${events.length === 1 ? 'event' : 'events'}`}
        </p>
      </div>

      {events.length === 0 ? (
        <EmptyState
          title={dateISO === today ? 'Nothing scheduled for today.' : 'Nothing scheduled for this day.'}
          body="When something is planned for this date, it will appear here."
          action={
            <button type="button" onClick={onViewUpcoming} className="btn btn-sm btn-outline">
              View upcoming
            </button>
          }
        />
      ) : (
        <div className="space-y-4">
          {allDay.length > 0 && (
            <section>
              <h3 className="section-title mb-2">All day</h3>
              <div className="space-y-2">
                {allDay.map((event) => (
                  <EventCard key={event.id} event={event} showDate={false} />
                ))}
              </div>
            </section>
          )}

          {timed.length > 0 && (
            <section>
              {allDay.length > 0 && <h3 className="section-title mb-2">Scheduled</h3>}
              <div className="space-y-2">
                {timed.map((event) => (
                  <EventCard key={event.id} event={event} showDate={false} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
