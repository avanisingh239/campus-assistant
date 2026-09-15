import { describe, expect, it } from "vitest";
import {
  timeToMinutes,
  timeRangesOverlap,
  timeRangeFitsWithin,
  dayOfWeekFromDate,
} from "./overlap";

describe("timeToMinutes", () => {
  it("parses HH:MM", () => {
    expect(timeToMinutes("09:30")).toBe(570);
  });

  it("parses HH:MM:SS, ignoring seconds", () => {
    expect(timeToMinutes("09:30:15")).toBe(570);
  });

  it("parses midnight and end-of-day", () => {
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("23:59")).toBe(1439);
  });
});

describe("timeRangesOverlap", () => {
  it("detects a clear overlap", () => {
    expect(timeRangesOverlap("09:00", "10:00", "09:30", "10:30")).toBe(true);
  });

  it("detects one range fully inside another as overlapping", () => {
    expect(timeRangesOverlap("09:00", "12:00", "10:00", "11:00")).toBe(true);
  });

  it("does not count touching-but-not-overlapping ranges", () => {
    // schema.sql's formula: start1 < end2 AND start2 < end1 - equal
    // boundary is NOT `<`, so back-to-back ranges don't clash.
    expect(timeRangesOverlap("09:00", "10:00", "10:00", "11:00")).toBe(false);
  });

  it("does not count fully separate ranges", () => {
    expect(timeRangesOverlap("09:00", "10:00", "11:00", "12:00")).toBe(false);
  });

  it("is symmetric regardless of argument order", () => {
    expect(timeRangesOverlap("09:30", "10:30", "09:00", "10:00")).toBe(true);
  });
});

describe("timeRangeFitsWithin", () => {
  it("true when the inner range is fully contained", () => {
    expect(timeRangeFitsWithin("10:00", "11:00", "09:00", "12:00")).toBe(true);
  });

  it("true when the inner range exactly matches the outer range", () => {
    expect(timeRangeFitsWithin("09:00", "12:00", "09:00", "12:00")).toBe(true);
  });

  it("false when the inner range starts before the outer range", () => {
    expect(timeRangeFitsWithin("08:30", "11:00", "09:00", "12:00")).toBe(false);
  });

  it("false when the inner range ends after the outer range", () => {
    expect(timeRangeFitsWithin("10:00", "12:30", "09:00", "12:00")).toBe(false);
  });
});

describe("dayOfWeekFromDate", () => {
  it("matches Date.getUTCDay()'s own numbering for an arbitrary date", () => {
    const date = "2026-09-18";
    expect(dayOfWeekFromDate(date)).toBe(new Date(`${date}T00:00:00Z`).getUTCDay());
  });

  it("is stable across several dates in the same week", () => {
    const days = ["2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19"];
    const results = days.map(dayOfWeekFromDate);
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
