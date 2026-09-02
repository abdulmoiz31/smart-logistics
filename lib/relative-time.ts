/**
 * Wait-time formatting for the dispatch console.
 *
 * A dispatcher needs "how long has this been sitting?", not a timestamp.
 * `9/2/2026, 2:27:28 AM` forces mental arithmetic; `3h 20m` does not.
 */

export type Urgency = 'fresh' | 'waiting' | 'overdue';

/** Minutes a quote may sit before it reads as waiting, then overdue. */
const WAITING_AFTER_MINUTES = 60;
const OVERDUE_AFTER_MINUTES = 240;

export function minutesSince(iso: string | undefined, now: number): number {
  if (!iso) return 0;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((now - then) / 60_000));
}

/** Compact duration: "just now", "12m", "3h 20m", "2d 4h". */
export function formatWait(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days}d ${restHours}h` : `${days}d`;
}

export function urgencyOf(minutes: number): Urgency {
  if (minutes >= OVERDUE_AFTER_MINUTES) return 'overdue';
  if (minutes >= WAITING_AFTER_MINUTES) return 'waiting';
  return 'fresh';
}
