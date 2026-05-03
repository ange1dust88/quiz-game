// Supabase Realtime sends Postgres TIMESTAMP (without tz) as a naive string.
// new Date() would parse it as local time — normalise to ISO/UTC so we can
// safely diff against Date.now().
export function parsePgDate(value: unknown): string | null {
  if (!value || typeof value !== "string") return null;
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) return value;
  return value.replace(" ", "T") + "Z";
}

// "0:14" style relative timestamp for the events feed.
export function relativeTime(deltaMs: number): string {
  const sec = Math.max(0, Math.floor(deltaMs / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  return `${hr}h`;
}
