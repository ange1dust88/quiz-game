import { describe, expect, it } from "vitest";
import { parsePgDate, relativeTime } from "@/app/lib/dates";

describe("parsePgDate", () => {
  it("returns null for falsy / non-string input", () => {
    expect(parsePgDate(null)).toBe(null);
    expect(parsePgDate(undefined)).toBe(null);
    expect(parsePgDate("")).toBe(null);
    expect(parsePgDate(123)).toBe(null);
    expect(parsePgDate({})).toBe(null);
  });

  it("returns ISO strings unchanged when they already carry tz info", () => {
    expect(parsePgDate("2026-04-30T12:00:15.000Z")).toBe(
      "2026-04-30T12:00:15.000Z",
    );
    expect(parsePgDate("2026-04-30T12:00:15.000+00:00")).toBe(
      "2026-04-30T12:00:15.000+00:00",
    );
    expect(parsePgDate("2026-04-30T12:00:15-05:00")).toBe(
      "2026-04-30T12:00:15-05:00",
    );
  });

  it("normalises naive postgres timestamps to UTC", () => {
    // Realtime payload format: "YYYY-MM-DD HH:MM:SS.sss"
    expect(parsePgDate("2026-04-30 12:00:15.000")).toBe(
      "2026-04-30T12:00:15.000Z",
    );
    expect(parsePgDate("2026-04-30 12:00:15")).toBe(
      "2026-04-30T12:00:15Z",
    );
  });

  it("produces a Date that matches the expected UTC instant", () => {
    const iso = parsePgDate("2026-04-30 12:00:15.000")!;
    const t = new Date(iso).getTime();
    expect(t).toBe(Date.UTC(2026, 3, 30, 12, 0, 15));
  });
});

describe("relativeTime", () => {
  it("formats sub-minute deltas in seconds", () => {
    expect(relativeTime(0)).toBe("0s");
    expect(relativeTime(2_500)).toBe("2s");
    expect(relativeTime(59_000)).toBe("59s");
  });

  it("clamps negative deltas at 0s", () => {
    expect(relativeTime(-1_000)).toBe("0s");
    expect(relativeTime(-50_000)).toBe("0s");
  });

  it("formats minute deltas with `m`", () => {
    expect(relativeTime(60_000)).toBe("1m");
    expect(relativeTime(125_000)).toBe("2m");
    expect(relativeTime(59 * 60_000)).toBe("59m");
  });

  it("formats hour deltas with `h`", () => {
    expect(relativeTime(60 * 60_000)).toBe("1h");
    expect(relativeTime(3 * 60 * 60_000 + 1234)).toBe("3h");
  });
});
