import { describe, expect, it } from "vitest";
import {
  relativeDay,
  formatTime12h,
  formatTimeRange,
  formatCapMeta,
  splitVerb,
  formatAbsoluteDate,
  formatRelativeTimeCaps,
  formatHeaderDate,
} from "./format";
import type { DashboardAnnouncement } from "./types";

const NOW = new Date("2026-09-14T12:00:00Z"); // a Monday

function announcement(overrides: Partial<DashboardAnnouncement> = {}): DashboardAnnouncement {
  return {
    id: "a1",
    category: "deadline",
    title: "Test",
    why_it_matters: null,
    what_to_do_next: null,
    confidence: "clear",
    confidence_note: null,
    event_date: null,
    start_time: null,
    end_time: null,
    deadline_at: null,
    link_url: null,
    link_verified: true,
    seat_count: null,
    seats_unclear: false,
    priority_score: 0,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    engagementStatus: "none",
    sourceCount: 1,
    contradiction: null,
    traceSources: [],
    ...overrides,
  };
}

describe("relativeDay", () => {
  it("labels today, tomorrow, yesterday", () => {
    expect(relativeDay("2026-09-14", NOW)).toBe("Today");
    expect(relativeDay("2026-09-15", NOW)).toBe("Tomorrow");
    expect(relativeDay("2026-09-13", NOW)).toBe("Yesterday");
  });

  it("labels the rest of this week as 'This <Weekday>'", () => {
    expect(relativeDay("2026-09-18", NOW)).toBe("This Friday");
  });

  it("labels next week as 'Next <Weekday>'", () => {
    expect(relativeDay("2026-09-22", NOW)).toBe("Next Tuesday");
  });

  it("falls back to a formatted date further out", () => {
    expect(relativeDay("2026-12-25", NOW)).toBe("Dec 25");
  });

  it("includes the year when it differs", () => {
    expect(relativeDay("2027-01-05", NOW)).toBe("Jan 5, 2027");
  });
});

describe("formatTime12h", () => {
  it("formats on-the-hour times without minutes", () => {
    expect(formatTime12h("14:00")).toBe("2pm");
    expect(formatTime12h("09:00:00")).toBe("9am");
  });

  it("formats midnight and noon correctly", () => {
    expect(formatTime12h("00:00")).toBe("12am");
    expect(formatTime12h("12:00")).toBe("12pm");
  });

  it("includes minutes when not on the hour", () => {
    expect(formatTime12h("18:30")).toBe("6:30pm");
  });
});

describe("formatTimeRange", () => {
  it("drops the repeated period when both sides match", () => {
    expect(formatTimeRange("14:00", "15:00")).toBe("2–3pm");
  });

  it("keeps both periods when they differ", () => {
    expect(formatTimeRange("11:00", "13:00")).toBe("11am–1pm");
  });
});

describe("splitVerb", () => {
  it("splits the leading verb from the rest", () => {
    expect(splitVerb("Pay before 6pm tomorrow")).toEqual({ verb: "Pay", rest: "before 6pm tomorrow" });
  });

  it("handles a single-word instruction", () => {
    expect(splitVerb("Submit")).toEqual({ verb: "Submit", rest: "" });
  });
});

describe("formatCapMeta", () => {
  it("uses a source count for society_link, not a date", () => {
    const a = announcement({ category: "society_link", sourceCount: 3, event_date: "2026-09-14" });
    expect(formatCapMeta(a, NOW)).toBe("Posted in 3 groups");
  });

  it("formats a deadline as 'Due <day>, <time>'", () => {
    const a = announcement({ deadline_at: "2026-09-15T18:00:00Z" });
    expect(formatCapMeta(a, NOW)).toBe("Due tomorrow, 6pm");
  });

  it("formats an event date + time range", () => {
    const a = announcement({
      category: "event",
      event_date: "2026-09-14",
      start_time: "14:00",
      end_time: "15:00",
    });
    expect(formatCapMeta(a, NOW)).toBe("Today, 2–3pm");
  });

  it("formats a date-only announcement", () => {
    const a = announcement({ category: "opportunity", event_date: "2026-09-18" });
    expect(formatCapMeta(a, NOW)).toBe("This Friday");
  });

  it("falls back to 'Time unspecified' when nothing is known", () => {
    expect(formatCapMeta(announcement({ category: "uncategorized" }), NOW)).toBe("Time unspecified");
  });
});

describe("formatAbsoluteDate", () => {
  it("never uses relative labels", () => {
    expect(formatAbsoluteDate("2026-09-14")).toBe("Sep 14");
  });
});

describe("formatHeaderDate", () => {
  it("formats the full weekday and month, matching the prototype's header badge", () => {
    expect(formatHeaderDate(NOW)).toBe("MONDAY, 14 SEPTEMBER");
  });
});

describe("formatRelativeTimeCaps", () => {
  it("labels minutes, hours, yesterday, and days", () => {
    expect(formatRelativeTimeCaps(new Date(NOW.getTime() - 40 * 60_000).toISOString(), NOW)).toBe("40 MIN AGO");
    expect(formatRelativeTimeCaps(new Date(NOW.getTime() - 3 * 3_600_000).toISOString(), NOW)).toBe("3 HOURS AGO");
    expect(formatRelativeTimeCaps(new Date(NOW.getTime() - 30 * 3_600_000).toISOString(), NOW)).toBe("YESTERDAY");
    expect(formatRelativeTimeCaps(new Date(NOW.getTime() - 3 * 86_400_000).toISOString(), NOW)).toBe("3 DAYS AGO");
  });
});
