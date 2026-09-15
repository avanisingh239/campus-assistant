import { describe, expect, it } from "vitest";
import { buildDiffSummary } from "./diff-summary";
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

describe("buildDiffSummary", () => {
  it("is 'first_visit' when last_seen_at is null", () => {
    expect(buildDiffSummary([announcement()], null)).toEqual({ kind: "first_visit" });
  });

  it("is 'no_changes' when nothing is newer than last_seen_at", () => {
    const old = announcement({ created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z" });
    expect(buildDiffSummary([old], "2026-09-10T00:00:00Z")).toEqual({ kind: "no_changes" });
  });

  it("counts a change on either created_at or updated_at", () => {
    const createdAfter = announcement({ id: "a", created_at: "2026-09-12T00:00:00Z" });
    const updatedAfter = announcement({
      id: "b",
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-12T00:00:00Z",
    });
    const result = buildDiffSummary([createdAfter, updatedAfter], "2026-09-10T00:00:00Z");
    expect(result.kind).toBe("updates");
    expect((result as { count: number }).count).toBe(2);
  });

  it("groups the summary text by category", () => {
    const deadline = announcement({ id: "a", category: "deadline", created_at: "2026-09-12T00:00:00Z" });
    const cancellation = announcement({
      id: "b",
      category: "cancellation",
      created_at: "2026-09-12T00:00:00Z",
    });
    const result = buildDiffSummary([deadline, cancellation], "2026-09-10T00:00:00Z");
    expect(result).toMatchObject({
      kind: "updates",
      count: 2,
      text: "2 updates since you last checked — 1 new deadline, 1 class cancelled.",
    });
  });

  it("uses singular phrasing for a single item", () => {
    const deadline = announcement({ id: "a", category: "deadline", created_at: "2026-09-12T00:00:00Z" });
    const result = buildDiffSummary([deadline], "2026-09-10T00:00:00Z");
    expect(result).toMatchObject({
      kind: "updates",
      count: 1,
      text: "1 update since you last checked — 1 new deadline.",
    });
  });
});
