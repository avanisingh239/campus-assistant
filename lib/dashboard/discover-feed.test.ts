import { describe, expect, it } from "vitest";
import { buildDiscoverFeed } from "./discover-feed";
import type { DashboardAnnouncement } from "./types";

function announcement(overrides: Partial<DashboardAnnouncement> = {}): DashboardAnnouncement {
  return {
    id: "a1",
    category: "opportunity",
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
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    engagementStatus: "none",
    sourceCount: 1,
    contradiction: null,
    traceSources: [],
    ...overrides,
  };
}

describe("buildDiscoverFeed", () => {
  it("excludes announcements marked not_interested", () => {
    const kept = announcement({ id: "keep", engagementStatus: "interested" });
    const excluded = announcement({ id: "exclude", engagementStatus: "not_interested" });
    const result = buildDiscoverFeed([kept, excluded]);
    expect(result.map((a) => a.id)).toEqual(["keep"]);
  });

  it("sorts by soonest deadline_at ascending", () => {
    const later = announcement({ id: "later", deadline_at: "2026-09-20T00:00:00Z" });
    const sooner = announcement({ id: "sooner", deadline_at: "2026-09-12T00:00:00Z" });
    const result = buildDiscoverFeed([later, sooner]);
    expect(result.map((a) => a.id)).toEqual(["sooner", "later"]);
  });

  it("sorts by soonest event_date ascending", () => {
    const later = announcement({ id: "later", event_date: "2026-10-01" });
    const sooner = announcement({ id: "sooner", event_date: "2026-09-15" });
    const result = buildDiscoverFeed([later, sooner]);
    expect(result.map((a) => a.id)).toEqual(["sooner", "later"]);
  });

  it("compares deadline_at and event_date on equal footing (soonest of either wins)", () => {
    const eventSoon = announcement({ id: "event-soon", event_date: "2026-09-12" });
    const deadlineLater = announcement({ id: "deadline-later", deadline_at: "2026-09-25T00:00:00Z" });
    const result = buildDiscoverFeed([deadlineLater, eventSoon]);
    expect(result.map((a) => a.id)).toEqual(["event-soon", "deadline-later"]);
  });

  it("sorts undated items after every dated item, regardless of priority_score", () => {
    const undated = announcement({ id: "undated", priority_score: 999 });
    const dated = announcement({ id: "dated", deadline_at: "2026-12-01T00:00:00Z", priority_score: 0 });
    const result = buildDiscoverFeed([undated, dated]);
    expect(result.map((a) => a.id)).toEqual(["dated", "undated"]);
  });

  it("breaks ties (including two undated items) by newest created_at first", () => {
    const older = announcement({ id: "older", created_at: "2026-09-01T00:00:00Z" });
    const newer = announcement({ id: "newer", created_at: "2026-09-10T00:00:00Z" });
    const result = buildDiscoverFeed([older, newer]);
    expect(result.map((a) => a.id)).toEqual(["newer", "older"]);
  });

  it("does not mutate the input array", () => {
    const input = [announcement({ id: "a" }), announcement({ id: "b" })];
    const inputCopy = [...input];
    buildDiscoverFeed(input);
    expect(input).toEqual(inputCopy);
  });
});
