/**
 * Dates travel as plain `YYYY-MM-DD` strings and times as `HH:MM`, with no
 * timezone attached: 4:00 PM in the Seminar Hall is 4:00 PM on every device.
 * Everything here works on those strings and only builds a Date for formatting.
 */

const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONTH_SHORT = MONTH_LONG.map((month) => month.slice(0, 3));

const WEEKDAY_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_INITIAL = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function todayISO(): string {
  return toISO(new Date());
}

export function toISO(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Builds a local Date at midday, which keeps arithmetic clear of DST edges. */
export function parseISO(dateISO: string): Date {
  const [year, month, day] = dateISO.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0);
}

export function addDays(dateISO: string, days: number): string {
  const date = parseISO(dateISO);
  date.setDate(date.getDate() + days);
  return toISO(date);
}

export function addMonths(dateISO: string, months: number): string {
  const [year, month, day] = dateISO.split('-').map(Number);
  const targetIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetIndex / 12);
  const targetMonth = ((targetIndex % 12) + 12) % 12;
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  return toISO(new Date(targetYear, targetMonth, Math.min(day, lastDay), 12));
}

export function startOfWeek(dateISO: string): string {
  const date = parseISO(dateISO);
  return addDays(dateISO, -date.getDay());
}

export function startOfMonth(dateISO: string): string {
  return `${dateISO.slice(0, 7)}-01`;
}

export function isSameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

export function dayOfWeek(dateISO: string): number {
  return parseISO(dateISO).getDay();
}

export function isWeekend(dateISO: string): boolean {
  const day = dayOfWeek(dateISO);
  return day === 0 || day === 6;
}

export interface CalendarCell {
  date: string;
  inMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
}

/** Six weeks of cells covering the given month, Sunday first. */
export function monthGrid(monthISO: string, today = todayISO()): CalendarCell[][] {
  const first = startOfMonth(monthISO);
  const gridStart = startOfWeek(first);
  const weeks: CalendarCell[][] = [];

  for (let week = 0; week < 6; week += 1) {
    const cells: CalendarCell[] = [];
    for (let day = 0; day < 7; day += 1) {
      const date = addDays(gridStart, week * 7 + day);
      cells.push({
        date,
        inMonth: isSameMonth(date, first),
        isToday: date === today,
        isWeekend: isWeekend(date),
      });
    }
    weeks.push(cells);
  }
  return weeks;
}

export function weekDates(dateISO: string): string[] {
  const start = startOfWeek(dateISO);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

// --- formatting ------------------------------------------------------------

export function formatDayNumber(dateISO: string): string {
  return String(parseISO(dateISO).getDate());
}

/** "Saturday, 12 September 2026" */
export function formatFullDate(dateISO: string): string {
  const date = parseISO(dateISO);
  return `${WEEKDAY_LONG[date.getDay()]}, ${date.getDate()} ${MONTH_LONG[date.getMonth()]} ${date.getFullYear()}`;
}

/** "12 September 2026" */
export function formatLongDate(dateISO: string): string {
  const date = parseISO(dateISO);
  return `${date.getDate()} ${MONTH_LONG[date.getMonth()]} ${date.getFullYear()}`;
}

/** "12 Sep" */
export function formatShortDate(dateISO: string): string {
  const date = parseISO(dateISO);
  return `${date.getDate()} ${MONTH_SHORT[date.getMonth()]}`;
}

/** "12 Sep 2026" */
export function formatMediumDate(dateISO: string): string {
  return `${formatShortDate(dateISO)} ${dateISO.slice(0, 4)}`;
}

/** "September 2026" */
export function formatMonthTitle(dateISO: string): string {
  const date = parseISO(dateISO);
  return `${MONTH_LONG[date.getMonth()]} ${date.getFullYear()}`;
}

/** "Sun 7 - Sat 13 Sep" for a week range. */
export function formatWeekTitle(dateISO: string): string {
  const dates = weekDates(dateISO);
  const first = parseISO(dates[0]);
  const last = parseISO(dates[6]);
  const sameMonth = first.getMonth() === last.getMonth();
  const left = `${first.getDate()} ${sameMonth ? '' : MONTH_SHORT[first.getMonth()]}`.trim();
  return `${left} - ${last.getDate()} ${MONTH_SHORT[last.getMonth()]} ${last.getFullYear()}`;
}

/** "4:00 PM" */
export function formatTime(time: string | null | undefined): string {
  if (!time) return '';
  const [hourText, minuteText] = time.split(':');
  const hour = Number(hourText);
  if (!Number.isFinite(hour)) return time;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${minuteText} ${suffix}`;
}

/** "4:00 PM - 6:00 PM", "4:00 PM" or "All day". */
export function formatTimeRange(
  start: string | null | undefined,
  end: string | null | undefined,
  allDay = false
): string {
  if (allDay) return 'All day';
  if (!start) return 'Time to be announced';
  return end ? `${formatTime(start)} - ${formatTime(end)}` : formatTime(start);
}

/** "Today", "Tomorrow", "Yesterday" or a short date. */
export function formatRelativeDay(dateISO: string, today = todayISO()): string {
  if (dateISO === today) return 'Today';
  if (dateISO === addDays(today, 1)) return 'Tomorrow';
  if (dateISO === addDays(today, -1)) return 'Yesterday';
  return formatShortDate(dateISO);
}

export function daysBetween(fromISO: string, toISO_: string): number {
  const from = parseISO(fromISO).getTime();
  const to = parseISO(toISO_).getTime();
  return Math.round((to - from) / 86_400_000);
}

/** "in 3 days", "in 2 weeks", "3 days ago". */
export function formatDistanceInDays(dateISO: string, today = todayISO()): string {
  const delta = daysBetween(today, dateISO);
  if (delta === 0) return 'today';
  if (delta === 1) return 'tomorrow';
  if (delta === -1) return 'yesterday';
  const magnitude = Math.abs(delta);
  const unit =
    magnitude < 14
      ? `${magnitude} days`
      : magnitude < 60
        ? `${Math.round(magnitude / 7)} weeks`
        : `${Math.round(magnitude / 30)} months`;
  return delta > 0 ? `in ${unit}` : `${unit} ago`;
}

/**
 * Formats a `due_at` value ("2026-09-15 18:00") for display.
 */
export function formatDueAt(dueAt: string | null | undefined, today = todayISO()): string {
  if (!dueAt) return '';
  const [date, time] = dueAt.split(' ');
  const dayLabel = formatRelativeDay(date, today);
  return time && time !== '23:59' ? `${dayLabel} - ${formatTime(time)}` : dayLabel;
}

export function isPastDue(dueAt: string | null | undefined, today = todayISO()): boolean {
  if (!dueAt) return false;
  return dueAt.slice(0, 10) < today;
}

/** Formats a server timestamp ("2026-09-12 17:40:01") as a readable moment. */
export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '';
  const [date, time] = value.split(/[ T]/);
  if (!date) return value;
  const dayLabel = formatRelativeDay(date);
  return time ? `${dayLabel}, ${formatTime(time.slice(0, 5))}` : dayLabel;
}

export function minutesFromTime(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return (hour || 0) * 60 + (minute || 0);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
