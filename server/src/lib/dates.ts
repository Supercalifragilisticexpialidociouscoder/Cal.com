/**
 * Calendar dates are stored as plain `YYYY-MM-DD` strings and times as `HH:MM`.
 * Keeping them timezone-free is deliberate: an event at 4:00 PM in the Seminar
 * Hall is at 4:00 PM regardless of the viewer's device timezone.
 */

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

export function isValidTime(value: string): boolean {
  return TIME_RE.test(value);
}

export function todayISO(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

export function toUTCDate(dateISO: string): Date {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function fromUTCDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function addDays(dateISO: string, days: number): string {
  const date = toUTCDate(dateISO);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUTCDate(date);
}

/** Adds whole months, clamping to the last valid day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(dateISO: string, months: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const targetMonthIndex = m - 1 + months;
  const targetYear = y + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return fromUTCDate(new Date(Date.UTC(targetYear, normalizedMonth, Math.min(d, lastDay))));
}

export function minutesFromTime(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** True when [aStart, aEnd) and [bStart, bEnd) share any minute. */
export function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Expands a repeat rule into concrete dates, including the first one.
 * Capped so a careless "daily forever" cannot fill the database.
 */
export function expandRepeat(options: {
  startDate: string;
  rule: 'none' | 'daily' | 'weekly' | 'monthly' | 'custom';
  interval: number;
  until: string | null;
  maxOccurrences?: number;
}): string[] {
  const { startDate, rule, until } = options;
  const interval = Math.max(1, Math.min(52, Math.floor(options.interval || 1)));
  const maxOccurrences = Math.max(1, Math.min(200, options.maxOccurrences ?? 60));

  if (rule === 'none') return [startDate];

  // Default horizon when no end date is given: one year out.
  const horizon = until && isValidDate(until) ? until : addMonths(startDate, 12);
  const dates: string[] = [];
  let cursor = startDate;
  let guard = 0;

  while (cursor <= horizon && dates.length < maxOccurrences && guard < 1000) {
    guard += 1;
    dates.push(cursor);
    if (rule === 'daily' || rule === 'custom') {
      cursor = addDays(cursor, rule === 'custom' ? interval : interval);
    } else if (rule === 'weekly') {
      cursor = addDays(cursor, 7 * interval);
    } else {
      cursor = addMonths(cursor, interval);
    }
  }

  return dates.length > 0 ? dates : [startDate];
}

/** `2026-09-12 18:30` / `2026-09-12T18:30` -> comparable sortable string. */
export function normalizeDateTime(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(trimmed);
  if (!match) return null;
  if (!isValidDate(match[1])) return null;
  if (match[2] && !isValidTime(match[2])) return null;
  return match[2] ? `${match[1]} ${match[2]}` : `${match[1]} 23:59`;
}
