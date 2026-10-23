import type { FocusSession } from './types';

const riyadhFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit',
});

/** The completion day, never the device's configured time zone. */
export function riyadhDate(input: Date | string = new Date()): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  const parts = riyadhFormatter.formatToParts(date);
  const get = (key: string) => parts.find(part => part.type === key)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function dayTimestamp(day: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new RangeError('Invalid calendar day');
  const timestamp = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== day) {
    throw new RangeError('Invalid calendar day');
  }
  return timestamp;
}

export function addDays(day: string, count: number): string {
  return new Date(dayTimestamp(day) + Math.trunc(count) * 86_400_000).toISOString().slice(0, 10);
}

/** Calendar days until day. Date-only exam values use Riyadh's current date. */
export function daysUntil(day: string, today: string = riyadhDate()): number {
  return Math.round((dayTimestamp(day) - dayTimestamp(today)) / 86_400_000);
}

export function weekday(day: string): number {
  return new Date(dayTimestamp(day)).getUTCDay();
}

export function streak(sessions: FocusSession[], today: string = riyadhDate()): {
  current: number; longest: number; days: string[];
} {
  dayTimestamp(today);
  const days = Array.from(new Set(sessions
    .filter(session => session.kind === 'focus' && session.status === 'completed' && session.completed_at)
    .map(session => riyadhDate(session.completed_at!))
    .filter(day => day <= today))).sort();
  const completed = new Set(days);
  let current = 0;
  let cursor = completed.has(today) ? today : addDays(today, -1);
  while (completed.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  let longest = 0;
  let consecutive = 0;
  let previous: string | null = null;
  for (const day of days) {
    consecutive = previous && addDays(previous, 1) === day ? consecutive + 1 : 1;
    longest = Math.max(longest, consecutive);
    previous = day;
  }
  return { current, longest, days };
}
