import { describe, expect, it } from "vitest";
import {
  firstActiveDeadline,
  isDeadlinePassed,
  timeLeftSeconds,
} from "@/app/lib/timers";

const NOW = Date.UTC(2026, 4, 3, 12, 0, 0); // 2026-05-03T12:00:00Z

const iso = (offsetSec: number) =>
  new Date(NOW + offsetSec * 1000).toISOString();

describe("timeLeftSeconds", () => {
  it("returns null for null/undefined deadline", () => {
    expect(timeLeftSeconds(null, NOW)).toBe(null);
    expect(timeLeftSeconds(undefined as unknown as null, NOW)).toBe(null);
  });

  it("returns whole seconds remaining for a future deadline", () => {
    expect(timeLeftSeconds(iso(15), NOW)).toBe(15);
    expect(timeLeftSeconds(iso(1), NOW)).toBe(1);
  });

  it("ceils sub-second remainders so the badge ticks down naturally", () => {
    expect(timeLeftSeconds(iso(0.4), NOW)).toBe(1); // 400ms left → still "1s"
    expect(timeLeftSeconds(iso(14.9), NOW)).toBe(15);
  });

  it("clamps at 0 when the deadline has passed", () => {
    expect(timeLeftSeconds(iso(0), NOW)).toBe(0);
    expect(timeLeftSeconds(iso(-1), NOW)).toBe(0);
    expect(timeLeftSeconds(iso(-3600), NOW)).toBe(0);
  });

  it("matches a real expand-stage 15s window", () => {
    // Server sets expiresAt = now + 15s, client clock is in sync
    const expires = iso(15);
    expect(timeLeftSeconds(expires, NOW)).toBe(15);
    expect(timeLeftSeconds(expires, NOW + 5_000)).toBe(10);
    expect(timeLeftSeconds(expires, NOW + 15_000)).toBe(0);
    expect(timeLeftSeconds(expires, NOW + 16_000)).toBe(0);
  });

  it("handles small client clock skew (server ms-ahead)", () => {
    // Deadline computed by server is e.g. 12:00:14.500, client now is 12:00:00
    const expires = new Date(NOW + 14_500).toISOString();
    expect(timeLeftSeconds(expires, NOW)).toBe(15); // ceil keeps display at 15s
  });
});

describe("isDeadlinePassed", () => {
  it("returns false for null deadline (no timer running)", () => {
    expect(isDeadlinePassed(null, NOW)).toBe(false);
  });

  it("returns false while deadline is in the future", () => {
    expect(isDeadlinePassed(iso(1), NOW)).toBe(false);
    expect(isDeadlinePassed(iso(15), NOW)).toBe(false);
  });

  it("returns true at the exact instant or after", () => {
    expect(isDeadlinePassed(iso(0), NOW)).toBe(true);
    expect(isDeadlinePassed(iso(-1), NOW)).toBe(true);
    expect(isDeadlinePassed(iso(-3600), NOW)).toBe(true);
  });
});

describe("firstActiveDeadline", () => {
  it("returns the first non-null candidate", () => {
    expect(firstActiveDeadline([null, null, iso(5), iso(10)])).toBe(iso(5));
  });

  it("skips empty strings and undefined alongside null", () => {
    expect(firstActiveDeadline([null, undefined, "", iso(3)])).toBe(iso(3));
  });

  it("returns null when nothing is active", () => {
    expect(firstActiveDeadline([null, null, undefined])).toBe(null);
    expect(firstActiveDeadline([])).toBe(null);
  });
});
