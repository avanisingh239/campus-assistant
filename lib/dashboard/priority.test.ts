import { describe, expect, it } from "vitest";
import { pickUrgentAnnouncementId } from "./priority";
import type { DashboardAnnouncement } from "./types";

const NOW = new Date("2026-09-14T12:00:00Z");

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

describe("pickUrgentAnnouncementId", () => {
  it("picks the highest priority_score", () => {
    const low = announcement({ id: "low", priority_score: 1, deadline_at: "2026-09-20T00:00:00Z" });
    const high = announcement({ id: "high", priority_score: 5, deadline_at: "2026-09-25T00:00:00Z" });
    expect(pickUrgentAnnouncementId([low, high], NOW)).toBe("high");
  });

  it("breaks a score tie by the soonest upcoming deadline", () => {
    const soon = announcement({ id: "soon", priority_score: 0, deadline_at: "2026-09-15T00:00:00Z" });
    const later = announcement({ id: "later", priority_score: 0, deadline_at: "2026-09-25T00:00:00Z" });
    expect(pickUrgentAnnouncementId([later, soon], NOW)).toBe("soon");
  });

  it("ignores categories where urgency isn't meaningful", () => {
    const fyi = announcement({ id: "fyi", category: "fyi", priority_score: 10 });
    const link = announcement({ id: "link", category: "society_link", priority_score: 10 });
    expect(pickUrgentAnnouncementId([fyi, link], NOW)).toBeNull();
  });

  it("returns null when there is no score and no upcoming date at all", () => {
    const nothing = announcement({ id: "nothing", priority_score: 0, deadline_at: null, event_date: null });
    expect(pickUrgentAnnouncementId([nothing], NOW)).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(pickUrgentAnnouncementId([], NOW)).toBeNull();
  });

  it("does not consider a past deadline 'upcoming'", () => {
    const past = announcement({ id: "past", priority_score: 0, deadline_at: "2026-01-01T00:00:00Z" });
    expect(pickUrgentAnnouncementId([past], NOW)).toBeNull();
  });
});
