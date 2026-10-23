import type { FocusSession } from './types';

/** A rendering calculation only. Completion is always confirmed by the database. */
export function remainingSeconds(session: FocusSession, nowMs: number = Date.now()): number {
  if (session.status === 'completed') return 0;
  const savedElapsed = Math.max(0, Number.isFinite(session.elapsed_seconds) ? session.elapsed_seconds : 0);
  const started = session.started_at ? Date.parse(session.started_at) : NaN;
  const runningElapsed = session.status === 'running' && Number.isFinite(started)
    ? Math.max(0, nowMs - started) / 1000
    : 0;
  return Math.max(0, Math.ceil(session.duration_seconds - savedElapsed - runningElapsed));
}

export function formatTimer(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`;
}
