/**
 * Interprets guest-pass `date` (YYYY-MM-DD) and `timeStart` / `timeEnd` (HH:mm) in the
 * server's local timezone. Deployments should set the server TZ to the estate's region
 * or run this service in a timezone-aligned environment.
 */

function parseYmd(dateStr: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return null;
  return { y, m: mo, d };
}

function parseHm(s: string | undefined, fallbackH: number, fallbackM: number): { h: number; min: number } {
  const t = (s ?? "").trim();
  if (!t) return { h: fallbackH, min: fallbackM };
  const parts = t.split(":");
  const h = Math.min(23, Math.max(0, parseInt(parts[0] ?? "0", 10) || 0));
  const min = Math.min(59, Math.max(0, parseInt(parts[1] ?? "0", 10) || 0));
  return { h, min };
}

export function isSameLocalCalendarDay(dateStr: string | undefined, now: Date): boolean {
  if (!dateStr?.trim()) return false;
  const ymd = parseYmd(dateStr);
  if (!ymd) return false;
  return (
    now.getFullYear() === ymd.y && now.getMonth() === ymd.m - 1 && now.getDate() === ymd.d
  );
}

/** Returns true if `now` is on `dateStr` and between `timeStart` and `timeEnd` inclusive. */
export function isWithinServiceWindow(
  now: Date,
  dateStr: string | undefined,
  timeStart: string | undefined,
  timeEnd: string | undefined,
): boolean {
  if (!isSameLocalCalendarDay(dateStr, now)) return false;
  const ymd = parseYmd(dateStr!);
  if (!ymd) return false;
  const start = parseHm(timeStart, 0, 0);
  const end = parseHm(timeEnd, 23, 59);
  const startMs = new Date(ymd.y, ymd.m - 1, ymd.d, start.h, start.min, 0, 0).getTime();
  const endMs = new Date(ymd.y, ymd.m - 1, ymd.d, end.h, end.min, 59, 999).getTime();
  const t = now.getTime();
  return t >= startMs && t <= endMs;
}
