// Pure timer math used across the match UI. No DOM, no DB — easy to test.

export function timeLeftSeconds(
  expiresAtIso: string | null,
  now: number,
): number | null {
  if (!expiresAtIso) return null;
  const ms = new Date(expiresAtIso).getTime() - now;
  return Math.max(0, Math.ceil(ms / 1000));
}

export function isDeadlinePassed(
  expiresAtIso: string | null,
  now: number,
): boolean {
  if (!expiresAtIso) return false;
  return new Date(expiresAtIso).getTime() <= now;
}

// Pick the soonest active deadline from a priority-ordered list.
// First non-null entry wins (matches the existing ActionPanel ordering rules).
export function firstActiveDeadline(
  candidates: (string | null | undefined)[],
): string | null {
  for (const c of candidates) {
    if (c) return c;
  }
  return null;
}
