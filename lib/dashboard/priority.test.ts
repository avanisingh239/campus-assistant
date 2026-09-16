import { describe, expect, it } from "vitest";
import {
  CONSEQUENCE_WEIGHTS,
  computePriorityScore,
  computeUrgencyScore,
  pickUrgentAnnouncementId,
  sortByPriorityScore,
} from "./priority";
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
    priority_score: 0, // stored column, unused by this file's own logic now — see priority.ts's closing note
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    engagementStatus: "none",
    sourceCount: 1,
    contradiction: null,
    traceSources: [],
    ...overrides,
  };
}

describe("computeUrgencyScore", () => {
  it("scores a near-term deadline higher than a far one", () => {
    const near = computeUrgencyScore(
      announcement({ deadline_at: "2026-09-15T12:00:00Z" }), // 1 day out
      NOW,
    );
    const far = computeUrgencyScore(
      announcement({ deadline_at: "2026-10-14T12:00:00Z" }), // 30 days out
      NOW,
    );
    expect(near).toBeGreaterThan(far);
  });

  it("scores 0 for a deadline that has already passed, not maximally urgent", () => {
    const past = computeUrgencyScore(announcement({ deadline_at: "2026-09-01T00:00:00Z" }), NOW);
    expect(past).toBe(0);
  });

  it("scores 100 for something due right now", () => {
    expect(computeUrgencyScore(announcement({ deadline_at: NOW.toISOString() }), NOW)).toBe(100);
  });

  it("handles no date at all without crashing, and scores it low rather than maximal", () => {
    const noDate = computeUrgencyScore(announcement({ deadline_at: null, event_date: null }), NOW);
    expect(noDate).toBeGreaterThan(0);
    expect(noDate).toBeLessThan(20);
  });

  it("falls back to event_date + start_time when there's no deadline_at", () => {
    const withStartTime = computeUrgencyScore(
      announcement({ event_date: "2026-09-15", start_time: "12:00" }), // 1 day out
      NOW,
    );
    const farAway = computeUrgencyScore(
      announcement({ event_date: "2026-10-14", start_time: "12:00" }), // 30 days out
      NOW,
    );
    expect(withStartTime).toBeGreaterThan(farAway);
  });

  it("defaults to midnight when event_date has no start_time", () => {
    // 2026-09-15T00:00Z is still "tomorrow" relative to NOW — should not crash and should still score high.
    const score = computeUrgencyScore(announcement({ event_date: "2026-09-15", start_time: null }), NOW);
    expect(score).toBeGreaterThan(50);
  });

  it("flattens to 0 well beyond the urgency window, not negative", () => {
    const veryFar = computeUrgencyScore(announcement({ deadline_at: "2027-09-14T12:00:00Z" }), NOW);
    expect(veryFar).toBe(0);
  });
});

describe("CONSEQUENCE_WEIGHTS", () => {
  it("weights deadline and registered_update as the top tier", () => {
    expect(CONSEQUENCE_WEIGHTS.deadline).toBe(1.0);
    expect(CONSEQUENCE_WEIGHTS.registered_update).toBe(1.0);
  });

  it("weights cancellation, opportunity, and event as a middle tier below the top", () => {
    for (const category of ["cancellation", "opportunity", "event"] as const) {
      expect(CONSEQUENCE_WEIGHTS[category]).toBeLessThan(CONSEQUENCE_WEIGHTS.deadline);
      expect(CONSEQUENCE_WEIGHTS[category]).toBeGreaterThan(CONSEQUENCE_WEIGHTS.fyi);
    }
  });

  it("weights fyi, society_link, duplicate, and uncategorized as the lowest tier", () => {
    const lowest = ["fyi", "society_link", "duplicate", "uncategorized"] as const;
    for (const category of lowest) {
      expect(CONSEQUENCE_WEIGHTS[category]).toBeLessThan(CONSEQUENCE_WEIGHTS.cancellation);
    }
  });
});

describe("computePriorityScore", () => {
  it("a registered_update generally outscores an fyi at the same distance in time", () => {
    const sameDate = "2026-09-16T12:00:00Z"; // 2 days out for both
    const registeredUpdate = computePriorityScore(
      announcement({ category: "registered_update", deadline_at: sameDate }),
      NOW,
    );
    const fyi = computePriorityScore(announcement({ category: "fyi", deadline_at: sameDate }), NOW);
    expect(registeredUpdate).toBeGreaterThan(fyi);
  });

  it("a near-term item in a lower-weight category can still outscore a far-off item in the top-weight category", () => {
    const nearOpportunity = computePriorityScore(
      announcement({ category: "opportunity", event_date: "2026-09-15", start_time: "12:00" }),
      NOW,
    );
    const farDeadline = computePriorityScore(
      announcement({ category: "deadline", deadline_at: "2027-01-01T00:00:00Z" }),
      NOW,
    );
    expect(nearOpportunity).toBeGreaterThan(farDeadline);
  });

  it("a no-date item never dominates a near-term item of any category", () => {
    const noDate = computePriorityScore(announcement({ category: "deadline", deadline_at: null }), NOW);
    const nearFyi = computePriorityScore(
      announcement({ category: "fyi", deadline_at: "2026-09-15T12:00:00Z" }),
      NOW,
    );
    expect(noDate).toBeLessThan(nearFyi);
  });

  it("real bug: an opportunity closing today beats a registered_update happening in several days, despite its lower category weight", () => {
    // Exact reported scenario. Before the near-term floor, this failed:
    // urgency(6h out)=98.2 * opportunity's 0.6 weight = 58.9, vs.
    // urgency(4 days out)=71.4 * registered_update's 1.0 weight = 71.4 —
    // the schedule-change update won despite being far less time-sensitive
    // than the same-day opportunity. The floor fixes it by scoring the
    // near-term item on raw urgency alone (98.2), bypassing the weight
    // multiplier entirely, so it can never lose to a lower-urgency item
    // just because that item's category happens to be weighted higher.
    const opportunityClosingToday = computePriorityScore(
      announcement({ category: "opportunity", event_date: "2026-09-14", start_time: "18:00" }), // 6h out
      NOW,
    );
    const registeredUpdateInDays = computePriorityScore(
      announcement({ category: "registered_update", deadline_at: "2026-09-18T12:00:00Z" }), // 4 days out
      NOW,
    );
    expect(opportunityClosingToday).toBeGreaterThan(registeredUpdateInDays);
  });

  it("the near-term floor only applies inside the threshold — beyond it, the ordinary weighted formula still governs", () => {
    // Same category pairing and similar-ish distance, but both now outside
    // the 24h near-term window (2 days / 4 days out) — the higher-weight
    // registered_update should win here, same as before this fix, proving
    // the floor is a genuine bounded branch, not a blanket override.
    const opportunityIn2Days = computePriorityScore(
      announcement({ category: "opportunity", event_date: "2026-09-16", start_time: "12:00" }),
      NOW,
    );
    const registeredUpdateIn4Days = computePriorityScore(
      announcement({ category: "registered_update", deadline_at: "2026-09-18T12:00:00Z" }),
      NOW,
    );
    expect(registeredUpdateIn4Days).toBeGreaterThan(opportunityIn2Days);
  });
});

describe("sortByPriorityScore", () => {
  it("orders announcements highest-score-first", () => {
    const low = announcement({ id: "low", category: "fyi", deadline_at: null });
    const high = announcement({ id: "high", category: "deadline", deadline_at: "2026-09-15T00:00:00Z" });
    const mid = announcement({
      id: "mid",
      category: "opportunity",
      event_date: "2026-09-20",
      start_time: "09:00",
    });
    expect(sortByPriorityScore([low, mid, high], NOW).map((a) => a.id)).toEqual(["high", "mid", "low"]);
  });

  it("does not mutate the input array", () => {
    const input = [announcement({ id: "a" }), announcement({ id: "b" })];
    const copy = [...input];
    sortByPriorityScore(input, NOW);
    expect(input).toEqual(copy);
  });
});

describe("pickUrgentAnnouncementId", () => {
  it("picks the highest-scoring eligible announcement", () => {
    const low = announcement({ id: "low", priority_score: 999, deadline_at: "2026-10-25T00:00:00Z" });
    const high = announcement({ id: "high", deadline_at: "2026-09-15T00:00:00Z" });
    expect(pickUrgentAnnouncementId([low, high], NOW)).toBe("high");
  });

  it("ignores categories where urgency isn't meaningful, regardless of stored priority_score", () => {
    const fyi = announcement({ id: "fyi", category: "fyi", priority_score: 999, deadline_at: NOW.toISOString() });
    const link = announcement({ id: "link", category: "society_link", priority_score: 999 });
    expect(pickUrgentAnnouncementId([fyi, link], NOW)).toBeNull();
  });

  it("returns null when nothing eligible clears the urgency threshold", () => {
    const farOff = announcement({ id: "far", category: "deadline", deadline_at: "2026-12-31T00:00:00Z" });
    const noDate = announcement({ id: "none", category: "opportunity", event_date: null });
    expect(pickUrgentAnnouncementId([farOff, noDate], NOW)).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(pickUrgentAnnouncementId([], NOW)).toBeNull();
  });

  it("does not treat a past deadline as urgent", () => {
    const past = announcement({ id: "past", deadline_at: "2026-01-01T00:00:00Z" });
    expect(pickUrgentAnnouncementId([past], NOW)).toBeNull();
  });

  it("a near-term event can outrank a far-off deadline for the ribbon", () => {
    const nearEvent = announcement({
      id: "near-event",
      category: "event",
      event_date: "2026-09-15",
      start_time: "09:00",
    });
    const farDeadline = announcement({
      id: "far-deadline",
      category: "deadline",
      deadline_at: "2026-10-20T00:00:00Z",
    });
    expect(pickUrgentAnnouncementId([nearEvent, farDeadline], NOW)).toBe("near-event");
  });

  it("real bug: an opportunity closing today wins the ribbon over a registered_update happening in several days", () => {
    const opportunityClosingToday = announcement({
      id: "opportunity-today",
      category: "opportunity",
      event_date: "2026-09-14",
      start_time: "18:00", // 6h out
    });
    const registeredUpdateInDays = announcement({
      id: "registered-update-later",
      category: "registered_update",
      deadline_at: "2026-09-18T12:00:00Z", // 4 days out
    });
    expect(pickUrgentAnnouncementId([opportunityClosingToday, registeredUpdateInDays], NOW)).toBe(
      "opportunity-today",
    );
  });
});
