import { describe, expect, it } from "vitest";
import { filterAnnouncements } from "./category-filter";
import type { DashboardAnnouncement } from "./types";

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
    payment_risk: false,
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

describe("filterAnnouncements", () => {
  it("'all' returns every announcement unchanged", () => {
    const list = [announcement({ id: "a" }), announcement({ id: "b", category: "fyi" })];
    expect(filterAnnouncements(list, "all", new Set())).toEqual(list);
  });

  it("'deadline' keeps only category === 'deadline'", () => {
    const list = [announcement({ id: "d", category: "deadline" }), announcement({ id: "e", category: "event" })];
    expect(filterAnnouncements(list, "deadline", new Set()).map((a) => a.id)).toEqual(["d"]);
  });

  it("'events' keeps event and opportunity, matching the card's own color grouping", () => {
    const list = [
      announcement({ id: "e", category: "event" }),
      announcement({ id: "o", category: "opportunity" }),
      announcement({ id: "r", category: "registered_update" }),
    ];
    expect(filterAnnouncements(list, "events", new Set()).map((a) => a.id).sort()).toEqual(["e", "o"]);
  });

  it("'conflicts' keeps only announcements in the clashed-id set", () => {
    const list = [announcement({ id: "clashed" }), announcement({ id: "clear" })];
    expect(filterAnnouncements(list, "conflicts", new Set(["clashed"])).map((a) => a.id)).toEqual(["clashed"]);
  });

  it("'unclear' keeps only confidence === 'unclear'", () => {
    const list = [
      announcement({ id: "u", confidence: "unclear" }),
      announcement({ id: "c", confidence: "clear" }),
    ];
    expect(filterAnnouncements(list, "unclear", new Set()).map((a) => a.id)).toEqual(["u"]);
  });
});
